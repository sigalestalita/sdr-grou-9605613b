import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  modelosDosItens,
  montarConteudo,
  moedaBr,
  type ConteudoProposta,
  type ModeloTexto,
  type Secao,
} from "@/lib/propostas/render";
import { PUBLIC_SITE_URL } from "@/lib/propostas/site";
import { hojeSP } from "@/lib/datas-sp";

/*
 * Propostas comerciais e seus modelos (lado logado). O cliente entra pela
 * página pública /proposta/<token> (propostas-publico.functions.ts).
 */
const solto = (s: unknown) => s as SupabaseClient;

const secaoZ = z.object({
  titulo: z.string().trim().min(1).max(160),
  corpo: z.string().max(40_000),
});

const modeloZ = z.object({
  nome: z.string().trim().min(1).max(120),
  descricao: z.string().trim().max(400).nullable().optional(),
  cor: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .default("#f08a24"),
  titulo: z.string().trim().min(1).max(160),
  introducao: z.string().max(4000),
  condicoes: z.string().max(4000),
  secoes: z.array(secaoZ).max(30),
  rodape: z.string().max(8000),
  codigo_nfse: z.string().trim().max(200).nullable().optional(),
  validade_dias: z.number().int().min(1).max(365).default(10),
  padrao: z.boolean().default(false),
  ativo: z.boolean().default(true),
});
export type ModeloEntrada = z.infer<typeof modeloZ>;

type ModeloRow = ModeloEntrada & {
  id: string;
  versao: number;
  origem: string;
  ordem: number;
  updated_at: string;
};

const COLS_MODELO =
  "id, nome, descricao, cor, titulo, introducao, condicoes, secoes, rodape, codigo_nfse, validade_dias, padrao, ativo, versao, origem, ordem, updated_at";

function paraTexto(m: ModeloRow): ModeloTexto {
  return {
    id: m.id,
    nome: m.nome,
    versao: m.versao,
    cor: m.cor,
    titulo: m.titulo,
    introducao: m.introducao,
    condicoes: m.condicoes,
    secoes: (m.secoes ?? []) as Secao[],
    rodape: m.rodape,
    codigo_nfse: m.codigo_nfse ?? null,
  };
}

async function podePropor(db: SupabaseClient, userId: string) {
  const { data } = await db.rpc("pode_propor", { _user_id: userId });
  return !!data;
}

// ---------------------------------------------------------------------------
// Modelos
// ---------------------------------------------------------------------------
export const listarModelos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = solto(context.supabase);
    const [{ data, error }, pode, { data: usos }] = await Promise.all([
      db
        .from("proposta_modelos")
        .select(COLS_MODELO)
        .order("ativo", { ascending: false })
        .order("ordem")
        .order("nome"),
      podePropor(db, context.userId),
      db.from("products").select("proposta_modelo_id").not("proposta_modelo_id", "is", null),
    ]);
    if (error) throw new Error(error.message);
    const itens = new Map<string, number>();
    for (const u of (usos ?? []) as Array<{ proposta_modelo_id: string }>) {
      itens.set(u.proposta_modelo_id, (itens.get(u.proposta_modelo_id) ?? 0) + 1);
    }
    return {
      podeEditar: pode,
      modelos: ((data ?? []) as ModeloRow[]).map((m) => ({
        ...m,
        itensNoCatalogo: itens.get(m.id) ?? 0,
      })),
    };
  });

export const versoesDoModelo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const { data: rows, error } = await db
      .from("proposta_modelo_versoes")
      .select("versao, conteudo, created_at, salvo_por")
      .eq("modelo_id", data.id)
      .order("versao", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{ versao: number; conteudo: ModeloEntrada; created_at: string }>;
  });

/** Cria (sem id) ou salva uma nova versão (com id); a anterior vai para o histórico. */
export const salvarModelo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().nullable(),
        origem: z.enum(["manual", "duplicado", "importado"]).default("manual"),
        modelo: modeloZ,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const agora = new Date().toISOString();
    const m = data.modelo;
    let id = data.id;
    if (id) {
      const { data: atual, error: e1 } = await db
        .from("proposta_modelos")
        .select(COLS_MODELO)
        .eq("id", id)
        .maybeSingle();
      if (e1) throw new Error(e1.message);
      if (!atual) throw new Error("Modelo não encontrado");
      const a = atual as ModeloRow;
      const { error: e2 } = await db.from("proposta_modelo_versoes").insert({
        modelo_id: id,
        versao: a.versao,
        conteudo: {
          nome: a.nome,
          descricao: a.descricao,
          cor: a.cor,
          titulo: a.titulo,
          introducao: a.introducao,
          condicoes: a.condicoes,
          secoes: a.secoes,
          rodape: a.rodape,
          codigo_nfse: a.codigo_nfse,
          validade_dias: a.validade_dias,
          padrao: a.padrao,
          ativo: a.ativo,
        },
        salvo_por: context.userId,
      });
      if (e2 && !/duplicate/i.test(e2.message)) throw new Error(e2.message);
      const { error } = await db
        .from("proposta_modelos")
        .update({ ...m, versao: a.versao + 1, updated_by: context.userId, updated_at: agora })
        .eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { data: novo, error } = await db
        .from("proposta_modelos")
        .insert({
          ...m,
          origem: data.origem,
          created_by: context.userId,
          updated_by: context.userId,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      id = (novo as { id: string }).id;
    }
    if (m.padrao) {
      await db.from("proposta_modelos").update({ padrao: false }).neq("id", id).eq("padrao", true);
    }
    return { id };
  });

export const duplicarModelo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const { data: m, error } = await db
      .from("proposta_modelos")
      .select(COLS_MODELO)
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    const a = m as ModeloRow;
    const { data: novo, error: e2 } = await db
      .from("proposta_modelos")
      .insert({
        nome: `${a.nome} (cópia)`.slice(0, 120),
        descricao: a.descricao,
        cor: a.cor,
        titulo: a.titulo,
        introducao: a.introducao,
        condicoes: a.condicoes,
        secoes: a.secoes,
        rodape: a.rodape,
        codigo_nfse: a.codigo_nfse,
        validade_dias: a.validade_dias,
        padrao: false,
        ativo: true,
        origem: "duplicado",
        ordem: a.ordem + 1,
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("id")
      .single();
    if (e2) throw new Error(e2.message);
    return { id: (novo as { id: string }).id };
  });

/** Itens do catálogo que usam cada modelo (para ligar/desligar no editor). */
export const itensDoModelo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const { data: rows, error } = await db
      .from("products")
      .select("id, nome, marca, tipo, subcategoria, proposta_modelo_id")
      .eq("ativo", true)
      .order("marca")
      .order("nome");
    if (error) throw new Error(error.message);
    return ((rows ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: r.id as string,
      nome: String(r.nome),
      grupo: [r.marca, r.subcategoria].filter(Boolean).join(" · ") || "Sem marca",
      doModelo: r.proposta_modelo_id === data.id,
      outroModelo: !!r.proposta_modelo_id && r.proposta_modelo_id !== data.id,
    }));
  });

export const ligarItensAoModelo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), produtos: z.array(z.string().uuid()).max(500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    // O catálogo é do ADM (RLS de products): sem permissão o update passaria em branco.
    const { data: adm } = await db.rpc("pode_faturar", { _user_id: context.userId });
    if (!adm) throw new Error("Só o Administrativo ou a gestão muda os itens do catálogo");
    const { error: e1 } = await db
      .from("products")
      .update({ proposta_modelo_id: null })
      .eq("proposta_modelo_id", data.id);
    if (e1) throw new Error(e1.message);
    if (data.produtos.length) {
      const { error } = await db
        .from("products")
        .update({ proposta_modelo_id: data.id })
        .in("id", data.produtos);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Importar modelo de print, arquivo ou texto (IA)
// ---------------------------------------------------------------------------
const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

const arquivoZ = z.object({
  nome: z.string().max(200),
  tipo: z.string().max(100),
  // data URL (imagem ou PDF) — até ~6 MB cada
  dataUrl: z.string().max(8_500_000),
});

export const importarModelo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        texto: z.string().max(200_000).default(""),
        arquivos: z.array(arquivoZ).max(8).default([]),
      })
      .refine((x) => x.texto.trim() || x.arquivos.length, "Mande um texto, print ou arquivo")
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await podePropor(solto(context.supabase), context.userId))) {
      throw new Error("Sem permissão para criar modelos");
    }
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY não configurada");

    const instrucao = `Você recebe uma proposta comercial (prints, PDF ou texto) da Grou, empresa de gestão de pessoas. Transforme-a num MODELO reutilizável.
Regras:
- Copie o texto LITERALMENTE (cláusulas, listas, valores percentuais, códigos). Não resuma nem reescreva.
- Remova a tabela de itens/preços e o total do pedido: eles vêm do sistema.
- Troque dados do cliente por variáveis: nome do contato → {{contato.nome}}, empresa do cliente → {{empresa.nome}}, CNPJ do cliente → {{empresa.cnpj}}, forma de pagamento com "XX" → {{pagamento}}, validade com "XX" → {{validade}}.
- Formato do texto: markdown simples. Parágrafos separados por linha em branco; itens de lista começam com "- "; negrito com **texto**. Nada de tabelas ou HTML.
- "introducao" = o que vem antes das condições (ex.: "A/C: {{contato.nome}} | {{empresa.nome}}" e a frase de abertura).
- "condicoes" = bloco de condições gerais (pagamento, validade, frete/prazo).
- "secoes" = cada bloco com título depois da tabela (ex.: "Objeto e Recursos", "Termos de compra").
- "rodape" = dados da Grou, código de serviço da NFS-e e fechamento.
- "codigo_nfse" = só o código (ex.: "1.05"), ou null.
- "cor" = cor da faixa do topo em hex (#rrggbb) se visível; senão "#f08a24".
Responda SÓ com JSON: {"nome": string, "descricao": string, "titulo": string, "cor": string, "introducao": string, "condicoes": string, "secoes": [{"titulo": string, "corpo": string}], "rodape": string, "codigo_nfse": string|null}`;

    const partes: Array<Record<string, unknown>> = [{ type: "text", text: instrucao }];
    if (data.texto.trim()) partes.push({ type: "text", text: `TEXTO:\n${data.texto}` });
    for (const a of data.arquivos) {
      partes.push({ type: "text", text: `Arquivo: ${a.nome}` });
      partes.push({ type: "image_url", image_url: { url: a.dataUrl } });
    }

    const res = await fetch(AI_GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [{ role: "user", content: partes }],
        response_format: { type: "json_object" },
      }),
    });
    const corpo = await res.text();
    if (!res.ok) {
      if (res.status === 429)
        throw new Error("Muitas leituras seguidas. Tente de novo em 1 minuto.");
      if (res.status === 402) throw new Error("Créditos de IA esgotados no Lovable.");
      throw new Error(
        `Não consegui ler o material (${res.status}). Se for PDF ou Word, cole o texto.`,
      );
    }
    let txt = "";
    try {
      txt =
        (JSON.parse(corpo) as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]
          ?.message?.content ?? "";
    } catch {
      throw new Error("Resposta inválida da IA");
    }
    const json = txt.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    let bruto: Record<string, unknown>;
    try {
      bruto = JSON.parse(json) as Record<string, unknown>;
    } catch {
      throw new Error(
        "A IA não devolveu um modelo legível. Tente com menos prints ou cole o texto.",
      );
    }
    const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
    const cor = str(bruto.cor, 7);
    return {
      nome: str(bruto.nome, 120) || "Modelo importado",
      descricao: str(bruto.descricao, 400) || null,
      cor: /^#[0-9a-f]{6}$/i.test(cor) ? cor : "#f08a24",
      titulo: str(bruto.titulo, 160) || "Proposta Comercial",
      introducao: str(bruto.introducao, 4000),
      condicoes: str(bruto.condicoes, 4000),
      secoes: (Array.isArray(bruto.secoes) ? bruto.secoes : [])
        .map((s) => ({
          titulo: str((s as Secao).titulo, 160),
          corpo: str((s as Secao).corpo, 40_000),
        }))
        .filter((s) => s.titulo || s.corpo)
        .map((s) => ({ titulo: s.titulo || "Seção", corpo: s.corpo }))
        .slice(0, 30),
      rodape: str(bruto.rodape, 8000),
      codigo_nfse: str(bruto.codigo_nfse, 200) || null,
      validade_dias: 10,
      padrao: false,
      ativo: true,
    } satisfies ModeloEntrada;
  });

// ---------------------------------------------------------------------------
// Proposta do negócio
// ---------------------------------------------------------------------------
const COLS_PROPOSTA =
  "id, numero, versao, status, token, deal_id, modelo_id, valor_total, valor_desconto, valor_impostos, valor_final, validade_ate, enviada_em, enviada_para, visualizada_em, visualizacoes, aceita_em, aceite, recusada_em, recusa_motivo, created_at, created_by, conteudo";

/** O que o diálogo "Gerar proposta" precisa: contatos, modelos sugeridos, pagamento. */
export const dadosParaProposta = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ dealId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const { data: deal, error } = await db
      .from("deals")
      .select("id, nome, company_id, contact_id, valor_impostos, companies:company_id(nome, cnpj)")
      .eq("id", data.dealId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!deal) throw new Error("Negócio não encontrado");
    const d = deal as Record<string, unknown>;
    const [{ data: itens }, { data: dc }, { data: modelos }] = await Promise.all([
      db
        .from("deal_products")
        .select("nome, quantidade, products:product_id(proposta_modelo_id, parcelamento_max)")
        .eq("deal_id", data.dealId)
        .order("ordem"),
      db
        .from("deal_contacts")
        .select("principal, contacts:contact_id(id, nome, email, cargo, telefone)")
        .eq("deal_id", data.dealId),
      db
        .from("proposta_modelos")
        .select("id, nome, padrao, validade_dias")
        .eq("ativo", true)
        .order("ordem"),
    ]);
    type C = {
      id: string;
      nome: string | null;
      email: string | null;
      cargo: string | null;
      telefone: string | null;
    };
    const contatos = new Map<string, C & { principal: boolean }>();
    for (const r of (dc ?? []) as unknown as Array<{ principal: boolean; contacts: C | null }>) {
      if (r.contacts) contatos.set(r.contacts.id, { ...r.contacts, principal: r.principal });
    }
    if (d.company_id && contatos.size < 15) {
      const { data: daEmpresa } = await db
        .from("contacts")
        .select("id, nome, email, cargo, telefone")
        .eq("company_id", d.company_id as string)
        .eq("ativo", true)
        .limit(15);
      for (const c of (daEmpresa ?? []) as C[]) {
        if (!contatos.has(c.id)) contatos.set(c.id, { ...c, principal: c.id === d.contact_id });
      }
    }
    const linhas = (itens ?? []) as unknown as Array<{
      nome: string;
      products: { proposta_modelo_id: string | null; parcelamento_max: number | null } | null;
    }>;
    const ms = (modelos ?? []) as Array<{
      id: string;
      nome: string;
      padrao: boolean;
      validade_dias: number;
    }>;
    const padrao = ms.find((m) => m.padrao)?.id ?? ms[0]?.id ?? null;
    const sugeridos = modelosDosItens(
      linhas.map((l) => l.products?.proposta_modelo_id),
      padrao,
    ).filter((id) => ms.some((m) => m.id === id));
    const parcelas = Math.max(0, ...linhas.map((l) => l.products?.parcelamento_max ?? 0));
    const emp = d.companies as { nome: string; cnpj: string | null } | null;
    return {
      negocio: String(d.nome ?? ""),
      empresa: emp?.nome ?? null,
      temItens: linhas.length > 0,
      contatos: [...contatos.values()].sort((a, b) => Number(b.principal) - Number(a.principal)),
      modelos: ms,
      sugeridos,
      validadeDias: ms.find((m) => m.id === sugeridos[0])?.validade_dias ?? 10,
      pagamentoSugerido:
        parcelas > 1 ? `À vista ou em até ${parcelas}x sem juros no boleto` : "À vista",
    };
  });

export const gerarProposta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        dealId: z.string().uuid(),
        modeloIds: z.array(z.string().uuid()).min(1).max(6),
        contactId: z.string().uuid().nullable(),
        pagamento: z.string().trim().max(400),
        validadeDias: z.number().int().min(1).max(365),
        observacoes: z.string().max(4000).default(""),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const [{ data: deal }, { data: itens }, { data: modelos }, { data: eu }, contato] =
      await Promise.all([
        db
          .from("deals")
          .select("id, nome, company_id, valor_impostos, companies:company_id(nome, cnpj)")
          .eq("id", data.dealId)
          .maybeSingle(),
        db
          .from("deal_products")
          .select("nome, quantidade, valor_unitario, desconto_tipo, desconto, recorrencia")
          .eq("deal_id", data.dealId)
          .order("ordem"),
        db.from("proposta_modelos").select(COLS_MODELO).in("id", data.modeloIds),
        db.from("profiles").select("full_name, email").eq("id", context.userId).maybeSingle(),
        data.contactId
          ? db.from("contacts").select("id, nome, cargo").eq("id", data.contactId).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
    if (!deal) throw new Error("Negócio não encontrado");
    const linhas = (itens ?? []) as Array<Record<string, unknown>>;
    if (linhas.length === 0)
      throw new Error("Adicione os itens do negócio antes de gerar a proposta");
    const porId = new Map(((modelos ?? []) as ModeloRow[]).map((m) => [m.id, m]));
    const escolhidos = data.modeloIds.map((id) => porId.get(id)).filter((m): m is ModeloRow => !!m);
    if (escolhidos.length === 0) throw new Error("Modelo não encontrado");

    const d = deal as Record<string, unknown>;
    const emp = d.companies as { nome: string; cnpj: string | null } | null;
    const c = (contato as { data: { nome: string | null; cargo: string | null } | null }).data;
    const perfil = eu as { full_name: string | null; email: string | null } | null;
    const hoje = hojeSP(new Date());
    const conteudo = montarConteudo(escolhidos.map(paraTexto), {
      hoje,
      validadeDias: data.validadeDias,
      pagamento: data.pagamento,
      observacoes: data.observacoes,
      impostos: Number(d.valor_impostos ?? 0),
      negocio: String(d.nome ?? ""),
      cliente: {
        empresa: emp?.nome ?? String(d.nome ?? ""),
        contato: c?.nome ?? "",
        cargo: c?.cargo ?? null,
        cnpj: emp?.cnpj ?? null,
      },
      executivo: { nome: perfil?.full_name ?? "Grou", email: perfil?.email ?? null },
      itens: linhas.map((i) => ({
        nome: String(i.nome),
        quantidade: Number(i.quantidade ?? 1),
        valor_unitario: Number(i.valor_unitario ?? 0),
        desconto_tipo: i.desconto_tipo === "valor" ? "valor" : "pct",
        desconto: Number(i.desconto ?? 0),
        recorrencia: (i.recorrencia as "unico" | "mensal" | "anual") ?? "unico",
      })),
    });

    const { data: ult } = await db
      .from("propostas")
      .select("versao")
      .eq("deal_id", data.dealId)
      .order("versao", { ascending: false })
      .limit(1)
      .maybeSingle();
    const versao = ((ult as { versao: number } | null)?.versao ?? 0) + 1;

    const { data: nova, error } = await db
      .from("propostas")
      .insert({
        deal_id: data.dealId,
        company_id: d.company_id ?? null,
        contact_id: data.contactId,
        modelo_id: escolhidos[0].id,
        modelo_versao: escolhidos[0].versao,
        versao,
        status: "rascunho",
        conteudo,
        valor_total: conteudo.totais.total,
        valor_desconto: conteudo.totais.desconto,
        valor_impostos: conteudo.totais.impostos,
        valor_final: conteudo.totais.final,
        validade_ate: conteudo.validadeAte,
        created_by: context.userId,
      })
      .select("id, token, numero")
      .single();
    if (error) throw new Error(error.message);
    // A versão nova substitui as anteriores que ainda não foram respondidas.
    await db
      .from("propostas")
      .update({ status: "substituida", updated_at: new Date().toISOString() })
      .eq("deal_id", data.dealId)
      .lt("versao", versao)
      .in("status", ["rascunho", "enviada", "visualizada"]);
    return nova as { id: string; token: string; numero: number };
  });

export type PropostaLista = {
  id: string;
  numero: number;
  versao: number;
  status: string;
  token: string;
  dealId: string;
  negocio: string | null;
  empresa: string | null;
  valorFinal: number;
  valorTotal: number;
  validadeAte: string | null;
  enviadaEm: string | null;
  enviadaPara: string | null;
  visualizadaEm: string | null;
  visualizacoes: number;
  aceitaEm: string | null;
  aceite: { nome?: string; email?: string; cargo?: string } | null;
  recusadaEm: string | null;
  recusaMotivo: string | null;
  criadaEm: string;
  autor: string | null;
  modelos: string[];
  conteudo: ConteudoProposta;
};

export const listarPropostas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ dealId: z.string().uuid().optional(), status: z.string().max(20).optional() })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    let q = db
      .from("propostas")
      .select(`${COLS_PROPOSTA}, deals:deal_id(nome, companies:company_id(nome))`)
      .order("created_at", { ascending: false })
      .limit(data.dealId ? 50 : 400);
    if (data.dealId) q = q.eq("deal_id", data.dealId);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const lista = (rows ?? []) as Array<Record<string, unknown>>;
    const autores = [
      ...new Set(lista.map((r) => r.created_by as string | null).filter(Boolean)),
    ] as string[];
    const { data: perfis } = autores.length
      ? await db.from("profiles").select("id, full_name").in("id", autores)
      : { data: [] };
    const nome = new Map(
      ((perfis ?? []) as Array<{ id: string; full_name: string | null }>).map((p) => [
        p.id,
        p.full_name,
      ]),
    );
    return lista.map((r): PropostaLista => {
      const deal = r.deals as { nome: string | null; companies: { nome: string } | null } | null;
      const conteudo = r.conteudo as ConteudoProposta;
      return {
        id: r.id as string,
        numero: Number(r.numero),
        versao: Number(r.versao),
        status: String(r.status),
        token: String(r.token),
        dealId: String(r.deal_id),
        negocio: deal?.nome ?? null,
        empresa: deal?.companies?.nome ?? conteudo?.cliente?.empresa ?? null,
        valorFinal: Number(r.valor_final ?? 0),
        valorTotal: Number(r.valor_total ?? 0),
        validadeAte: (r.validade_ate as string | null) ?? null,
        enviadaEm: (r.enviada_em as string | null) ?? null,
        enviadaPara: (r.enviada_para as string | null) ?? null,
        visualizadaEm: (r.visualizada_em as string | null) ?? null,
        visualizacoes: Number(r.visualizacoes ?? 0),
        aceitaEm: (r.aceita_em as string | null) ?? null,
        aceite: (r.aceite as PropostaLista["aceite"]) ?? null,
        recusadaEm: (r.recusada_em as string | null) ?? null,
        recusaMotivo: (r.recusa_motivo as string | null) ?? null,
        criadaEm: String(r.created_at),
        autor: nome.get(r.created_by as string) ?? null,
        modelos: (conteudo?.modelos ?? []).map((m) => m.nome),
        conteudo,
      };
    });
  });

/** Marca como enviada (quando o executivo manda o link por fora: WhatsApp, cópia). */
export const marcarPropostaEnviada = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), para: z.string().trim().max(200).nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const { data: p } = await db
      .from("propostas")
      .select("status, enviada_em")
      .eq("id", data.id)
      .maybeSingle();
    const atual = p as { status: string; enviada_em: string | null } | null;
    if (!atual) throw new Error("Proposta não encontrada");
    if (["substituida", "cancelada"].includes(atual.status))
      throw new Error("Esta versão não vale mais");
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (atual.status === "rascunho") patch.status = "enviada";
    if (!atual.enviada_em) {
      patch.enviada_em = new Date().toISOString();
      patch.enviada_por = context.userId;
    }
    if (data.para) patch.enviada_para = data.para;
    const { error } = await db.from("propostas").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const enviarPropostaPorEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        para: z.string().trim().email(),
        assunto: z.string().trim().min(1).max(200),
        mensagem: z.string().max(4000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const [{ data: p }, { data: eu }] = await Promise.all([
      db
        .from("propostas")
        .select("status, token, numero, versao, conteudo")
        .eq("id", data.id)
        .maybeSingle(),
      db.from("profiles").select("full_name, email").eq("id", context.userId).maybeSingle(),
    ]);
    const prop = p as {
      status: string;
      token: string;
      numero: number;
      versao: number;
      conteudo: ConteudoProposta;
    } | null;
    if (!prop) throw new Error("Proposta não encontrada");
    if (["substituida", "cancelada"].includes(prop.status))
      throw new Error("Esta versão não vale mais");
    const perfil = eu as { full_name: string | null; email: string | null } | null;
    const link = `${PUBLIC_SITE_URL}/proposta/${prop.token}`;
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) throw new Error("RESEND_API_KEY não configurada");
    const esc = (s: string) =>
      s.replace(
        /[&<>"]/g,
        (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!,
      );
    const html = `<div style="font-family:Arial,sans-serif;color:#111;max-width:600px;line-height:1.5">
${esc(data.mensagem).replace(/\n/g, "<br>")}
<p style="margin:24px 0"><a href="${link}" style="background:#05104c;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600">Ver a proposta</a></p>
<p style="font-size:13px;color:#555">Proposta nº ${prop.numero} · ${moedaBr(prop.conteudo.totais.final)} · válida até ${prop.conteudo.validadeAte?.split("-").reverse().join("/") ?? ""}</p>
<p style="font-size:12px;color:#888">Se o botão não abrir: ${link}</p></div>`;
    const res = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": resendKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${perfil?.full_name ?? "Grou"} · Grou <noreply@grougp.com.br>`,
        to: [data.para],
        ...(perfil?.email ? { reply_to: perfil.email } : {}),
        subject: data.assunto,
        html,
        text: `${data.mensagem}\n\nVer a proposta: ${link}`,
      }),
    });
    if (!res.ok)
      throw new Error(
        `Falha ao enviar o e-mail (${res.status}): ${(await res.text()).slice(0, 200)}`,
      );
    const patch: Record<string, unknown> = {
      enviada_para: data.para,
      updated_at: new Date().toISOString(),
    };
    if (prop.status === "rascunho") patch.status = "enviada";
    const { data: atual } = await db
      .from("propostas")
      .select("enviada_em")
      .eq("id", data.id)
      .maybeSingle();
    if (!(atual as { enviada_em: string | null } | null)?.enviada_em) {
      patch.enviada_em = new Date().toISOString();
      patch.enviada_por = context.userId;
    }
    await db.from("propostas").update(patch).eq("id", data.id);
    return { ok: true, link };
  });

export const cancelarProposta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const { error } = await db
      .from("propostas")
      .update({ status: "cancelada", updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .in("status", ["rascunho", "enviada", "visualizada"]);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
