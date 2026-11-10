import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { IDS_CAMPOS, IDS_OPERADORES } from "@/lib/email-marketing/campos";

/*
 * E-mail marketing: segmentações, campanhas, envio, métricas e descadastros.
 * As tabelas são lidas com o acesso de quem pede; montar a lista e enviar é
 * feito pelo servidor (envio.server.ts).
 */
type Row = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const t = (db: unknown, nome: string) => (db as any).from(nome);

export const RegrasSchema = z.object({
  base: z.enum(["todos", "kanban", "marketing"]).default("todos"),
  origens: z.array(z.string()).default([]),
  tipos: z.array(z.string()).default([]),
  etapas: z.array(z.string()).default([]),
  prioridades: z.array(z.string()).default([]),
  responsaveis: z.array(z.string().uuid()).default([]),
  sinaleiras: z.array(z.string()).default([]),
  cliente: z.enum(["", "sim", "nao"]).default(""),
  campanha_contem: z.string().max(120).default(""),
  conversao_contem: z.string().max(120).default(""),
  email_contem: z.string().max(120).default(""),
  converteu_desde: z.string().max(10).default(""),
  criado_desde: z.string().max(10).default(""),
  criado_ate: z.string().max(10).default(""),
  /** Empresas escolhidas: só leads dessas empresas. */
  empresas: z
    .array(z.object({ id: z.string().uuid(), nome: z.string().max(200) }))
    .max(500)
    .default([]),
  /** Condições sobre campos do lead, do contato e da empresa (todas valem). */
  condicoes: z
    .array(
      z.object({
        campo: z.enum(IDS_CAMPOS),
        operador: z.enum(IDS_OPERADORES),
        valor: z.string().max(200).default(""),
      }),
    )
    .max(20)
    .default([]),
});
export type Regras = z.infer<typeof RegrasSchema>;

// ---------------------------------------------------------------- opções
export const opcoesDeSegmentacao = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: origens }, { data: etapas }, { data: pessoas }] = await Promise.all([
      supabaseAdmin.rpc("leads_origens_distintas" as never).then(
        (r) => r,
        () => ({ data: null }),
      ),
      context.supabase.from("stages").select("slug, name").order("position"),
      context.supabase.from("profiles").select("id, full_name").order("full_name"),
    ]);
    let lista = (origens as Array<{ source: string }> | null)?.map((o) => o.source) ?? null;
    if (!lista) {
      const { data } = await supabaseAdmin
        .from("leads")
        .select("source")
        .not("source", "is", null)
        .limit(20000);
      lista = [...new Set(((data ?? []) as Row[]).map((r) => String(r.source)))].sort();
    }
    return {
      origens: lista,
      etapas: (etapas ?? []) as Array<{ slug: string; name: string }>,
      pessoas: ((pessoas ?? []) as Row[]).map((p) => ({
        id: String(p.id),
        nome: String(p.full_name ?? "—"),
      })),
    };
  });

/** Valores mais comuns de um campo, para sugerir no editor. */
export const valoresDoCampo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ campo: z.enum(IDS_CAMPOS) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase.rpc(
      "email_valores_campo" as never,
      { campo: data.campo } as never,
    );
    if (error) throw new Error(error.message);
    return ((r ?? []) as Row[]).map((v) => ({ valor: String(v.valor), total: Number(v.total) }));
  });

/** Empresas pelo nome (para escolher na segmentação). */
export const buscarEmpresasSegmento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ termo: z.string().min(2).max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    const termo = data.termo.replace(/[%_,()]/g, " ").trim();
    const { data: r, error } = await context.supabase
      .from("companies")
      .select("id, nome, cidade, estado")
      .ilike("nome", `%${termo}%`)
      .order("nome")
      .limit(25);
    if (error) throw new Error(error.message);
    return ((r ?? []) as Row[]).map((e) => ({
      id: String(e.id),
      nome: String(e.nome),
      local: [e.cidade, e.estado].filter(Boolean).join(" / ") || null,
    }));
  });

// ---------------------------------------------------------- segmentações
export const listarSegmentos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await t(context.supabase, "email_segmentos")
      .select("id, nome, descricao, regras, ultima_contagem, contado_em, updated_at")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      id: string;
      nome: string;
      descricao: string | null;
      regras: Regras;
      ultima_contagem: number | null;
      contado_em: string | null;
      updated_at: string;
    }>;
  });

/** Quantos e quem (amostra) entram com estas regras. */
export const previaSegmento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ regras: RegrasSchema }).parse(d))
  .handler(async ({ data, context }) => {
    const [cont, amostra] = await Promise.all([
      context.supabase.rpc("email_segmento_contagem" as never, { regras: data.regras } as never),
      context.supabase.rpc(
        "email_segmento_leads" as never,
        { regras: data.regras, limite: 15 } as never,
      ),
    ]);
    if (cont.error) throw new Error(cont.error.message);
    return {
      total: Number(cont.data ?? 0),
      amostra: ((amostra.data ?? []) as Row[]).map((r) => ({
        lead_id: String(r.lead_id),
        email: String(r.email),
        nome: (r.nome as string) ?? null,
        empresa: (r.empresa as string) ?? null,
      })),
    };
  });

export const salvarSegmento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().nullable(),
        nome: z.string().min(1).max(160),
        descricao: z.string().max(500).nullable(),
        regras: RegrasSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: cont } = await context.supabase.rpc(
      "email_segmento_contagem" as never,
      { regras: data.regras } as never,
    );
    const campos = {
      nome: data.nome,
      descricao: data.descricao,
      regras: data.regras,
      ultima_contagem: Number(cont ?? 0),
      contado_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const q = data.id
      ? t(context.supabase, "email_segmentos")
          .update(campos)
          .eq("id", data.id)
          .select("id")
          .single()
      : t(context.supabase, "email_segmentos").insert(campos).select("id").single();
    const { data: r, error } = await q;
    if (error) throw new Error(error.message);
    return { id: String((r as Row).id), total: campos.ultima_contagem };
  });

export const apagarSegmento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await t(context.supabase, "email_segmentos").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// -------------------------------------------------------------- campanhas
const CampanhaSchema = z.object({
  id: z.string().uuid().nullable(),
  nome: z.string().min(1).max(160),
  segmento_id: z.string().uuid().nullable(),
  assunto: z.string().max(200),
  preheader: z.string().max(200).nullable(),
  corpo: z.string().max(100_000),
  formato: z.enum(["texto", "html"]),
  remetente_nome: z.string().min(1).max(80),
  remetente_email: z
    .string()
    .regex(/^[^@\s]+@grougp\.com\.br$/i, "O remetente precisa ser um e-mail @grougp.com.br"),
  responder_para: z.string().email().nullable(),
  imagem_topo: z
    .string()
    .url()
    .regex(/^https:\/\//i, "A imagem precisa de um endereço https")
    .nullable()
    .optional(),
});
export type CampanhaEditavel = z.infer<typeof CampanhaSchema>;

export const listarCampanhas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await t(context.supabase, "email_campanhas")
      .select(
        "id, nome, assunto, status, segmento_id, destinatarios, agendada_para, iniciada_em, concluida_em, updated_at",
      )
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const lista = (data ?? []) as Row[];
    const ids = lista.map((c) => String(c.id));
    const metricas = await metricasDe(context.supabase as unknown as SupabaseClient, ids);
    return lista.map((c) => ({
      id: String(c.id),
      nome: String(c.nome),
      assunto: String(c.assunto ?? ""),
      status: String(c.status),
      destinatarios: Number(c.destinatarios ?? 0),
      agendada_para: (c.agendada_para as string) ?? null,
      iniciada_em: (c.iniciada_em as string) ?? null,
      concluida_em: (c.concluida_em as string) ?? null,
      updated_at: String(c.updated_at),
      metricas: metricas.get(String(c.id)) ?? metricaVazia(),
    }));
  });

type Metricas = {
  enviados: number;
  pendentes: number;
  falhas: number;
  suprimidos: number;
  aberturas: number;
  cliques: number;
  descadastros: number;
};
const metricaVazia = (): Metricas => ({
  enviados: 0,
  pendentes: 0,
  falhas: 0,
  suprimidos: 0,
  aberturas: 0,
  cliques: 0,
  descadastros: 0,
});

async function metricasDe(db: SupabaseClient, ids: string[]) {
  const m = new Map<string, Metricas>();
  if (!ids.length) return m;
  // Contagens por campanha (até 1000 linhas por página).
  for (const id of ids) m.set(id, metricaVazia());
  const conta = async (
    campo: keyof Metricas,
    filtro: (q: ReturnType<SupabaseClient["from"]>) => unknown,
  ) => {
    await Promise.all(
      ids.map(async (id) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let q: any = db
          .from("email_envios")
          .select("id", { count: "exact", head: true })
          .eq("campanha_id", id);
        q = filtro(q);
        const { count } = await q;
        m.get(id)![campo] = count ?? 0;
      }),
    );
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const f = (fn: (q: any) => any) => fn;
  await Promise.all([
    conta(
      "enviados",
      f((q) => q.eq("status", "enviado")),
    ),
    conta(
      "pendentes",
      f((q) => q.eq("status", "pendente")),
    ),
    conta(
      "falhas",
      f((q) => q.eq("status", "falhou")),
    ),
    conta(
      "suprimidos",
      f((q) => q.eq("status", "suprimido")),
    ),
    conta(
      "aberturas",
      f((q) => q.not("aberto_em", "is", null)),
    ),
    conta(
      "cliques",
      f((q) => q.not("clicado_em", "is", null)),
    ),
    conta(
      "descadastros",
      f((q) => q.not("descadastrou_em", "is", null)),
    ),
  ]);
  return m;
}

export type CampanhaCompleta = CampanhaEditavel & {
  id: string;
  status: string;
  destinatarios: number;
  agendada_para: string | null;
  iniciada_em: string | null;
  concluida_em: string | null;
};
export type EnvioDaCampanha = {
  email: string;
  nome: string | null;
  empresa: string | null;
  lead_id: string | null;
  status: string;
  enviado_em: string | null;
  aberto_em: string | null;
  clicado_em: string | null;
  descadastrou_em: string | null;
  erro: string | null;
};

export const verCampanha = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: c, error } = await t(context.supabase, "email_campanhas")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error || !c) throw new Error("Campanha não encontrada");
    const metricas =
      (await metricasDe(context.supabase as unknown as SupabaseClient, [data.id])).get(data.id) ??
      metricaVazia();
    const { data: ultimos } = await t(context.supabase, "email_envios")
      .select(
        "email, nome, empresa, lead_id, status, enviado_em, aberto_em, clicado_em, descadastrou_em, erro",
      )
      .eq("campanha_id", data.id)
      .order("enviado_em", { ascending: false, nullsFirst: false })
      .limit(200);
    return {
      campanha: c as unknown as CampanhaCompleta,
      metricas,
      envios: (ultimos ?? []) as unknown as EnvioDaCampanha[],
    };
  });

export const salvarCampanha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => CampanhaSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...campos } = data;
    if (id) {
      const { data: atual } = await t(context.supabase, "email_campanhas")
        .select("status")
        .eq("id", id)
        .single();
      if (atual && !["rascunho", "agendada", "pausada"].includes(String((atual as Row).status)))
        throw new Error("Campanha já enviada não pode ser editada. Duplique para reaproveitar.");
    }
    const q = id
      ? t(context.supabase, "email_campanhas")
          .update({ ...campos, updated_at: new Date().toISOString() })
          .eq("id", id)
          .select("id")
          .single()
      : t(context.supabase, "email_campanhas").insert(campos).select("id").single();
    const { data: r, error } = await q;
    if (error) throw new Error(error.message);
    return { id: String((r as Row).id) };
  });

export const duplicarCampanha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: c } = await t(context.supabase, "email_campanhas")
      .select(
        "nome, segmento_id, assunto, preheader, corpo, formato, remetente_nome, remetente_email, responder_para, imagem_topo",
      )
      .eq("id", data.id)
      .single();
    if (!c) throw new Error("Campanha não encontrada");
    const { data: r, error } = await t(context.supabase, "email_campanhas")
      .insert({ ...(c as Row), nome: `${(c as Row).nome} (cópia)` })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: String((r as Row).id) };
  });

export const enviarTesteCampanha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), para: z.string().email() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: p } = await context.supabase
      .from("profiles")
      .select("full_name")
      .eq("id", context.userId)
      .maybeSingle();
    const { enviarTeste } = await import("@/lib/email-marketing/envio.server");
    return enviarTeste(data.id, data.para, (p as { full_name?: string } | null)?.full_name);
  });

/** Enviar agora, agendar, pausar, retomar ou cancelar. */
export const acaoCampanha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        acao: z.enum(["enviar", "agendar", "pausar", "retomar", "cancelar", "voltar_rascunho"]),
        quando: z.string().datetime().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const { data: c } = await t(db, "email_campanhas").select("status").eq("id", data.id).single();
    if (!c) throw new Error("Campanha não encontrada");
    const status = String((c as Row).status);
    const muda = async (campos: Row) => {
      const { error } = await t(db, "email_campanhas")
        .update({ ...campos, updated_at: new Date().toISOString() })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
    };
    if (data.acao === "enviar" || data.acao === "retomar") {
      const { iniciarCampanha, processarFila } = await import("@/lib/email-marketing/envio.server");
      const r = await iniciarCampanha(data.id);
      // Já manda o primeiro lote, sem esperar o próximo minuto.
      void processarFila({ tempoMaxMs: 20_000 }).catch(() => undefined);
      return { ok: true, ...r };
    }
    if (data.acao === "agendar") {
      if (!data.quando || new Date(data.quando).getTime() < Date.now() - 60_000)
        throw new Error("Escolha uma data futura");
      if (!["rascunho", "agendada"].includes(status)) throw new Error("Não dá para agendar agora");
      await muda({ status: "agendada", agendada_para: data.quando });
      return { ok: true };
    }
    if (data.acao === "pausar") {
      if (status !== "enviando") throw new Error("Só dá para pausar uma campanha em envio");
      await muda({ status: "pausada" });
      return { ok: true };
    }
    if (data.acao === "voltar_rascunho") {
      if (status !== "agendada") throw new Error("Só campanhas agendadas voltam a rascunho");
      await muda({ status: "rascunho", agendada_para: null });
      return { ok: true };
    }
    if (["enviada", "cancelada"].includes(status)) throw new Error("Campanha já encerrada");
    await muda({ status: "cancelada", concluida_em: new Date().toISOString() });
    return { ok: true };
  });

export const apagarCampanha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: c } = await t(context.supabase, "email_campanhas")
      .select("status")
      .eq("id", data.id)
      .single();
    if (c && !["rascunho", "cancelada"].includes(String((c as Row).status)))
      throw new Error("Só rascunhos e canceladas podem ser apagadas");
    const { error } = await t(context.supabase, "email_campanhas").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Situação do envio: limite diário e quanto já saiu hoje. */
export const situacaoDoEnvio = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("app_settings")
      .select("value")
      .eq("key", "email_limite_diario")
      .maybeSingle();
    const v = Number((data as { value?: { valor?: number | null } } | null)?.value?.valor);
    const limite = Number.isFinite(v) && v > 0 ? v : null;
    const inicio = new Date();
    inicio.setUTCHours(3, 0, 0, 0);
    if (inicio.getTime() > Date.now()) inicio.setUTCDate(inicio.getUTCDate() - 1);
    const { count } = await t(context.supabase, "email_envios")
      .select("id", { count: "exact", head: true })
      .gte("enviado_em", inicio.toISOString());
    return { limite, hoje: count ?? 0 };
  });

export const salvarLimiteDiario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ valor: z.number().int().min(1).max(1_000_000).nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: gestor } = await context.supabase.rpc("is_manager", {
      _user_id: context.userId,
    });
    if (!gestor) throw new Error("Só a gestão muda o limite diário");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert({ key: "email_limite_diario", value: { valor: data.valor } } as never, {
        onConflict: "key",
      });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ----------------------------------------------------------- descadastros
export const listarDescadastros = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await t(context.supabase, "email_descadastros")
      .select("email, motivo, origem, created_at")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      email: string;
      motivo: string | null;
      origem: string;
      created_at: string;
    }>;
  });

export const descadastrarManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        emails: z.array(z.string().email()).min(1).max(5000),
        motivo: z.string().max(200).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const linhas = [...new Set(data.emails.map((e) => e.trim().toLowerCase()))].map((email) => ({
      email,
      origem: "manual",
      motivo: data.motivo,
    }));
    const { error } = await t(context.supabase, "email_descadastros").upsert(linhas, {
      onConflict: "email",
      ignoreDuplicates: true,
    });
    if (error) throw new Error(error.message);
    return { ok: true, total: linhas.length };
  });

// ------------------------------------------------------------------ IA
/** Escreve assunto, pré-cabeçalho e corpo a partir de um briefing. */
export const escreverComIa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ briefing: z.string().min(5).max(3000), atual: z.string().max(20000).optional() })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const sistema = `Você escreve e-mails de marketing B2B da Grou (consultoria de gestão de pessoas, PDA Assessment, treinamentos e licenças). Português do Brasil, tom próximo e profissional, frases curtas, sem exageros nem promessas que não estejam no briefing.
Formato do corpo (texto simples, não HTML):
- "# " para título, linha em branco entre parágrafos, "- " para lista, **negrito**
- botão de chamada: uma linha só com [[Texto do botão|https://link]] (use o link do briefing; se não houver, use https://grougp.com.br)
- personalize com {{primeiro_nome|tudo bem}} na saudação; {{empresa}} se fizer sentido
- não escreva rodapé nem descadastro (o sistema põe)
Responda SOMENTE com JSON: {"assunto": "...", "preheader": "...", "corpo": "..."}`;
    const pedido = data.atual
      ? `E-mail atual:\n${data.atual}\n\nAjuste pedido: ${data.briefing}`
      : `Briefing: ${data.briefing}`;
    let bruto = "";
    const { temClaude, MODELO_CLAUDE } = await import("@/lib/assistente/claude.server");
    if (temClaude()) {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const r = await new Anthropic().beta.messages.create({
        model: MODELO_CLAUDE,
        max_tokens: 8000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: {
          effort: "low",
          format: {
            type: "json_schema",
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["assunto", "preheader", "corpo"],
              properties: {
                assunto: { type: "string" },
                preheader: { type: "string" },
                corpo: { type: "string" },
              },
            },
          },
        },
        system: sistema,
        messages: [{ role: "user", content: pedido }],
      });
      if (r.stop_reason === "refusal") throw new Error("A IA não escreveu esse e-mail.");
      bruto = r.content
        .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("");
    } else {
      const { callAI } = await import("@/lib/analytics-chat.functions");
      const r = await callAI(
        [
          { role: "system", content: sistema },
          { role: "user", content: pedido },
        ],
        [],
      );
      bruto = r.choices?.[0]?.message?.content ?? "";
    }
    try {
      const o = JSON.parse(bruto.slice(bruto.indexOf("{"), bruto.lastIndexOf("}") + 1)) as {
        assunto?: string;
        preheader?: string;
        corpo?: string;
      };
      return { assunto: o.assunto ?? "", preheader: o.preheader ?? "", corpo: o.corpo ?? "" };
    } catch {
      throw new Error("A IA não devolveu o e-mail no formato esperado. Tente de novo.");
    }
  });

// ------------------------------------------------------- imagem do topo
const TIPOS_IMAGEM: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

/**
 * Sobe a imagem do topo de uma campanha para o bucket público email-assets e
 * devolve a URL. O arquivo vem em base64 (até 2 MB).
 */
export const subirImagemTopo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        tipo: z.string().refine((x) => x in TIPOS_IMAGEM, "Use PNG, JPG, GIF ou WebP"),
        base64: z.string().min(1).max(2_800_000, "Imagem acima de 2 MB"),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const bytes = Buffer.from(data.base64, "base64");
    if (bytes.length > 2 * 1024 * 1024) throw new Error("Imagem acima de 2 MB");
    const caminho = `campanhas/${crypto.randomUUID()}.${TIPOS_IMAGEM[data.tipo]}`;
    const { error } = await supabaseAdmin.storage
      .from("email-assets")
      .upload(caminho, bytes, { contentType: data.tipo, upsert: false });
    if (error) throw new Error(error.message);
    const { data: pub } = supabaseAdmin.storage.from("email-assets").getPublicUrl(caminho);
    return { url: pub.publicUrl };
  });
