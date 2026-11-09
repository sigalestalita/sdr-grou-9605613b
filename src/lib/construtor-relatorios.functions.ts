import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { BASES_IDS, SpecSchema, normalizarSpec, type Spec } from "@/lib/relatorios/catalogo";

/*
 * Construtor de relatórios personalizados.
 * - montarRelatorio: o pedido em texto vira uma definição (spec) do catálogo,
 *   pelo Claude (resposta estruturada) ou, sem chave da Anthropic, pela IA do
 *   gateway do Lovable. A spec é sempre validada e normalizada.
 * - rodarRelatorio: executa a spec com o acesso de quem pede.
 * - salvos: listar, salvar, compartilhar e apagar.
 */
type Row = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tabela = (db: unknown) => (db as any).from("relatorios_salvos");

const ESQUEMA_SPEC = {
  type: "object",
  additionalProperties: false,
  required: [
    "base",
    "titulo",
    "dimensoes",
    "metricas",
    "periodo",
    "filtros",
    "ordenar_por",
    "ordem",
    "limite",
    "grafico",
    "explicacao",
  ],
  properties: {
    base: { type: "string", enum: [...BASES_IDS] },
    titulo: { type: "string" },
    dimensoes: { type: "array", items: { type: "string" } },
    metricas: { type: "array", items: { type: "string" } },
    periodo: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["campo", "de", "ate"],
          properties: {
            campo: { type: "string" },
            de: { type: ["string", "null"] },
            ate: { type: ["string", "null"] },
          },
        },
      ],
    },
    filtros: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["campo", "operador", "valor"],
        properties: {
          campo: { type: "string" },
          operador: { type: "string", enum: ["igual", "diferente", "contem"] },
          valor: { type: "string" },
        },
      },
    },
    ordenar_por: { type: ["string", "null"] },
    ordem: { type: "string", enum: ["desc", "asc"] },
    limite: { type: "integer" },
    grafico: { type: "string", enum: ["barras", "linhas", "pizza", "tabela"] },
    explicacao: { type: "string" },
  },
} as const;

async function contexto(db: SupabaseClient) {
  const [{ data: pessoas }, { data: funis }] = await Promise.all([
    db.from("profiles").select("full_name"),
    db.from("pipelines").select("nome"),
  ]);
  return {
    pessoas: ((pessoas ?? []) as Row[]).map((p) => p.full_name).filter(Boolean),
    funis: ((funis ?? []) as Row[]).map((f) => f.nome).filter(Boolean),
  };
}

export const montarRelatorio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        pedido: z.string().min(3).max(1000),
        atual: SpecSchema.nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as SupabaseClient;
    const { catalogoComoTexto } = await import("@/lib/relatorios/catalogo");
    const ctx = await contexto(db);
    const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

    const sistema = `Você monta relatórios do Grou Compass (CRM). Converta o pedido numa definição de relatório usando SOMENTE as bases, dimensões, métricas e datas do catálogo abaixo (use os ids exatos).
Regras:
- dimensoes: 0 a 2 (agrupamentos). metricas: 1 a 3.
- periodo: use quando o pedido falar de tempo ("este mês", "2026", "últimos 90 dias"); datas em AAAA-MM-DD; hoje é ${hoje}. Para vendas ganhas/perdidas use a data de fechamento (closed_at); para "criados/entraram" use created_at.
- filtros: campo = id de uma dimensão da base; valor = texto como aparece (ex.: status de negócio "Ganho", "Aberto", "Perdido"; sinaleira "vermelho"); use "contem" para nomes de pessoas.
- ordenar_por: id de métrica ou dimensão, ou null. limite entre 1 e 500.
- grafico: "linhas" para séries no tempo, "pizza" para poucas fatias (até 8), "barras" para rankings, "tabela" quando houver 2 dimensões ou muitas linhas.
- titulo curto em português. explicacao: 1 frase dizendo o que foi montado e qualquer suposição feita.
- Se o pedido não couber no catálogo, monte o mais próximo e diga na explicacao o que ficou de fora.

Pessoas: ${ctx.pessoas.join(", ")}
Funis: ${ctx.funis.join(", ")}

# CATÁLOGO
${catalogoComoTexto()}`;
    const pedido = data.atual
      ? `Relatório atual: ${JSON.stringify(data.atual)}\nAjuste pedido: ${data.pedido}`
      : data.pedido;

    let bruto: string;
    const { temClaude, MODELO_CLAUDE } = await import("@/lib/assistente/claude.server");
    if (temClaude()) {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic();
      const r = await client.beta.messages.create({
        model: MODELO_CLAUDE,
        max_tokens: 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: {
          effort: "low",
          format: {
            type: "json_schema",
            schema: ESQUEMA_SPEC as unknown as Record<string, unknown>,
          },
        },
        system: sistema,
        messages: [{ role: "user", content: pedido }],
      });
      if (r.stop_reason === "refusal") throw new Error("Não consegui montar esse relatório.");
      bruto = r.content
        .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("");
    } else {
      const { callAI } = await import("@/lib/analytics-chat.functions");
      const r = await callAI(
        [
          {
            role: "system",
            content: `${sistema}\n\nResponda SOMENTE com um objeto JSON com as chaves: ${ESQUEMA_SPEC.required.join(", ")}.`,
          },
          { role: "user", content: pedido },
        ],
        [],
      );
      bruto = r.choices?.[0]?.message?.content ?? "";
    }

    const json = bruto.slice(bruto.indexOf("{"), bruto.lastIndexOf("}") + 1);
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(json) as Record<string, unknown>;
    } catch {
      throw new Error("A IA não devolveu um relatório válido. Tente descrever de outro jeito.");
    }
    const explicacao = typeof obj.explicacao === "string" ? obj.explicacao : null;
    const limite = Math.max(1, Math.min(500, Math.round(Number(obj.limite) || 100)));
    const spec = SpecSchema.safeParse({ ...obj, limite });
    if (!spec.success)
      throw new Error("A IA montou um relatório fora do catálogo. Tente descrever de outro jeito.");
    return { spec: normalizarSpec(spec.data), explicacao };
  });

export const rodarRelatorio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ spec: SpecSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const { executarRelatorio } = await import("@/lib/relatorios/executar.server");
    return executarRelatorio(context.supabase as unknown as SupabaseClient, data.spec);
  });

/** Os registros por trás de um grupo do relatório (clique no gráfico ou na tabela). */
export const detalharGrupo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ spec: SpecSchema, grupo: z.record(z.string(), z.string().max(300)) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { detalharRelatorio } = await import("@/lib/relatorios/executar.server");
    return detalharRelatorio(context.supabase as unknown as SupabaseClient, data.spec, data.grupo);
  });

export type RelatorioSalvo = {
  id: string;
  nome: string;
  pergunta: string | null;
  spec: Spec;
  compartilhado: boolean;
  criado_por: string;
  meu: boolean;
  autor: string | null;
  updated_at: string;
};

export const listarRelatorios = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await tabela(context.supabase)
      .select("id, nome, pergunta, spec, compartilhado, criado_por, updated_at")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const lista = (data ?? []) as Row[];
    const autores = [...new Set(lista.map((r) => String(r.criado_por)))];
    const { data: perfis } = autores.length
      ? await context.supabase.from("profiles").select("id, full_name").in("id", autores)
      : { data: [] };
    const nome = new Map(
      ((perfis ?? []) as Row[]).map((p) => [String(p.id), (p.full_name as string) ?? null]),
    );
    return lista.map(
      (r): RelatorioSalvo => ({
        id: String(r.id),
        nome: String(r.nome),
        pergunta: (r.pergunta as string) ?? null,
        spec: r.spec as Spec,
        compartilhado: !!r.compartilhado,
        criado_por: String(r.criado_por),
        meu: r.criado_por === context.userId,
        autor: nome.get(String(r.criado_por)) ?? null,
        updated_at: String(r.updated_at),
      }),
    );
  });

export const salvarRelatorio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().nullable(),
        nome: z.string().min(1).max(160),
        pergunta: z.string().max(1000).nullable(),
        spec: SpecSchema,
        compartilhado: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const campos = {
      nome: data.nome,
      pergunta: data.pergunta,
      spec: normalizarSpec(data.spec),
      compartilhado: data.compartilhado,
      updated_at: new Date().toISOString(),
    };
    const q = data.id
      ? tabela(context.supabase).update(campos).eq("id", data.id).select("id").single()
      : tabela(context.supabase).insert(campos).select("id").single();
    const { data: r, error } = await q;
    if (error) throw new Error(error.message);
    return { id: String((r as Row).id) };
  });

export const apagarRelatorio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await tabela(context.supabase).delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
