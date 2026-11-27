import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/*
 * Integração com o Sales Coach (repositório salescoach-grou, conector "compass").
 *
 * O Sales Coach analisa as reuniões e chama POST /api/public/integracao com
 * "Authorization: Bearer compass_…" e { action, ... }. Contrato igual ao do CRM
 * do Lumi e do NEXA CRM: info, campos, criar_campo, por_email, buscar, negocio,
 * atualizar, nota, tarefa.
 *
 * "Negócio" para o Sales Coach: um negócio do Compass (id) ou, quando a pessoa
 * não tem negócio aberto, a empresa ("conta:<id>"), o contato ("contato:<id>")
 * ou o lead ("lead:<id>"). Toda reunião fica ligada a alguém.
 *
 *  - campos da análise → deals.sales_coach (sem negócio: companies.sales_coach)
 *  - nota (resumo)     → linha do tempo do negócio / empresa / lead
 *  - tarefa            → próximo passo do negócio ou do lead (empresa: nota), com
 *                        aviso no sino para o dono
 */

type Json = Record<string, unknown>;
export interface NegocioSc {
  id: string;
  name: string;
  status: string | null;
  fields: Json;
}

export class ErroIntegracao extends Error {
  constructor(
    public codigo: number,
    msg: string,
  ) {
    super(msg);
  }
}

export const PREFIXO_TOKEN = "compass_";
export const TOKEN_RE = /^compass_[A-Za-z0-9]{20,}$/;
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
export function novoToken(): string {
  return (
    PREFIXO_TOKEN +
    randomBytes(24)
      .toString("base64url")
      .replace(/[^A-Za-z0-9]/g, "")
  );
}

const STATUS: Record<string, string> = { open: "ongoing", won: "won", lost: "lost" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Texto para ilike/.or() (sem curingas, vírgulas e parênteses). */
export const literal = (s: string) => s.replace(/[\\%_,()*]/g, " ").trim();
/** E-mail exato num ilike: escapa os curingas. */
export const exato = (s: string) => s.replace(/[\\%_]/g, (c) => "\\" + c);
export const texto = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};
export const slugCampo = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40) || "campo";

/** "conta:<uuid>" → { tipo: "conta", ref }; um uuid sozinho é negócio. */
export function lerId(id: string): {
  tipo: "negocio" | "conta" | "contato" | "lead";
  ref: string;
} {
  const [a, b] = id.includes(":") ? id.split(":", 2) : ["negocio", id];
  const tipo = a === "negocio" || a === "conta" || a === "contato" || a === "lead" ? a : null;
  if (!tipo || !UUID.test(b)) throw new ErroIntegracao(404, "Negócio não encontrado");
  return { tipo, ref: b.toLowerCase() };
}

type LinhaNegocio = {
  id: string;
  nome: string;
  status: string;
  sales_coach: Json | null;
  companies: { nome: string } | null;
};

const paraNegocio = (d: LinhaNegocio): NegocioSc => ({
  id: d.id,
  name:
    d.companies?.nome && !d.nome.toLowerCase().includes(d.companies.nome.toLowerCase())
      ? `${d.nome} (${d.companies.nome})`
      : d.nome,
  status: STATUS[d.status] ?? "ongoing",
  fields: d.sales_coach ?? {},
});

/** Negócios de empresas/ids: abertos primeiro (até 20), depois os fechados mais novos. */
async function negocios(
  db: SupabaseClient,
  filtro: { empresas?: string[]; ids?: string[] },
): Promise<NegocioSc[]> {
  if (!filtro.empresas?.length && !filtro.ids?.length) return [];
  const base = () => {
    let q = db
      .from("deals")
      .select("id, nome, status, sales_coach, companies:company_id(nome)")
      .eq("exemplo", false);
    if (filtro.empresas?.length) q = q.in("company_id", filtro.empresas.slice(0, 50));
    if (filtro.ids?.length) q = q.in("id", filtro.ids.slice(0, 100));
    return q;
  };
  const [abertos, fechados] = await Promise.all([
    base().eq("status", "open").order("created_at", { ascending: false }).limit(20),
    base().neq("status", "open").order("created_at", { ascending: false }).limit(10),
  ]);
  if (abertos.error) throw new ErroIntegracao(500, abertos.error.message);
  return [...(abertos.data ?? []), ...(fechados.data ?? [])].map((d) =>
    paraNegocio(d as unknown as LinhaNegocio),
  );
}

const unicos = <T>(xs: Array<T | null | undefined>) => [...new Set(xs.filter(Boolean) as T[])];

export async function porEmail(db: SupabaseClient, email: string): Promise<NegocioSc[]> {
  const e = email.trim().toLowerCase();
  const [c1, c2, l] = await Promise.all([
    db
      .from("contacts")
      .select("id, nome, company_id")
      .ilike("email", exato(e))
      .eq("ativo", true)
      .limit(5),
    db
      .from("contacts")
      .select("id, nome, company_id")
      .contains("emails", [e])
      .eq("ativo", true)
      .limit(5),
    db
      .from("leads")
      .select("id, name, company_id, contact_id, deal_id")
      .ilike("email", exato(e))
      .eq("exemplo", false)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  const contatos = [...(c1.data ?? []), ...(c2.data ?? [])].filter(
    (x, i, a) => a.findIndex((y) => y.id === x.id) === i,
  ) as Array<{ id: string; nome: string; company_id: string | null }>;
  const leads = (l.data ?? []) as Array<{
    id: string;
    name: string;
    company_id: string | null;
    contact_id: string | null;
    deal_id: string | null;
  }>;
  const idsContatos = unicos([...contatos.map((x) => x.id), ...leads.map((x) => x.contact_id)]);
  const [vinculos, porContato] = idsContatos.length
    ? await Promise.all([
        db.from("company_contacts").select("company_id").in("contact_id", idsContatos),
        db.from("deal_contacts").select("deal_id").in("contact_id", idsContatos),
      ])
    : [{ data: [] }, { data: [] }];
  const empresas = unicos<string>([
    ...contatos.map((x) => x.company_id),
    ...leads.map((x) => x.company_id),
    ...((vinculos.data ?? []) as Array<{ company_id: string }>).map((x) => x.company_id),
  ]);
  const ids = unicos<string>([
    ...leads.map((x) => x.deal_id),
    ...((porContato.data ?? []) as Array<{ deal_id: string }>).map((x) => x.deal_id),
  ]);
  const ops = [...(await negocios(db, { empresas })), ...(await negocios(db, { ids }))].filter(
    (o, i, a) => a.findIndex((x) => x.id === o.id) === i,
  );
  if (ops.some((o) => o.status === "ongoing")) return ops;

  // Sem negócio aberto: liga à empresa; sem empresa, ao contato ou ao lead.
  const extra: NegocioSc[] = [];
  if (empresas.length) {
    const { data } = await db
      .from("companies")
      .select("id, nome, sales_coach")
      .in("id", empresas.slice(0, 20));
    for (const x of (data ?? []) as Array<{ id: string; nome: string; sales_coach: Json | null }>)
      extra.push({
        id: `conta:${x.id}`,
        name: `Empresa: ${x.nome} (sem negócio aberto)`,
        status: "ongoing",
        fields: x.sales_coach ?? {},
      });
  } else if (contatos.length) {
    for (const x of contatos)
      extra.push({
        id: `contato:${x.id}`,
        name: `Contato: ${x.nome}`,
        status: "ongoing",
        fields: {},
      });
  } else {
    for (const x of leads)
      extra.push({ id: `lead:${x.id}`, name: `Lead: ${x.name}`, status: "ongoing", fields: {} });
  }
  return [...extra, ...ops];
}

export async function buscar(db: SupabaseClient, termo: string): Promise<NegocioSc[]> {
  const t = literal(termo);
  if (t.length < 2) return [];
  const [o, cs, ct] = await Promise.all([
    db.from("deals").select("id").ilike("nome", `%${t}%`).eq("exemplo", false).limit(15),
    db
      .from("companies")
      .select("id, nome, sales_coach")
      .ilike("nome", `%${t}%`)
      .eq("ativo", true)
      .limit(10),
    db
      .from("contacts")
      .select("id, nome, companies:company_id(nome)")
      .or(`nome.ilike.%${t}%,email.ilike.%${t}%`)
      .eq("ativo", true)
      .limit(10),
  ]);
  const empresas = (cs.data ?? []) as Array<{ id: string; nome: string; sales_coach: Json | null }>;
  const lista = [
    ...(await negocios(db, { ids: ((o.data ?? []) as Array<{ id: string }>).map((x) => x.id) })),
    ...(await negocios(db, { empresas: empresas.map((x) => x.id) })),
  ].filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i);
  for (const x of empresas)
    lista.push({
      id: `conta:${x.id}`,
      name: `Empresa: ${x.nome}`,
      status: "ongoing",
      fields: x.sales_coach ?? {},
    });
  for (const x of (ct.data ?? []) as unknown as Array<{
    id: string;
    nome: string;
    companies: { nome: string } | null;
  }>)
    lista.push({
      id: `contato:${x.id}`,
      name: `Contato: ${x.nome}${x.companies ? ` (${x.companies.nome})` : ""}`,
      status: "ongoing",
      fields: {},
    });
  return lista.slice(0, 40);
}

type Alvo = {
  tipo: "negocio" | "conta" | "contato" | "lead";
  ref: string;
  nome: string;
  dealId: string | null;
  companyId: string | null;
  leadId: string | null;
  dono: string | null;
  status: string;
};

/** Onde gravar: negócio, empresa, contato ou lead (com a empresa de cada um, quando houver). */
export async function alvo(db: SupabaseClient, id: string): Promise<Alvo> {
  const { tipo, ref } = lerId(id);
  if (tipo === "negocio") {
    const { data } = await db
      .from("deals")
      .select("id, nome, status, company_id, executivo_user_id, owner_user_id")
      .eq("id", ref)
      .maybeSingle();
    const d = data as {
      nome: string;
      status: string;
      company_id: string | null;
      executivo_user_id: string | null;
      owner_user_id: string | null;
    } | null;
    if (!d) throw new ErroIntegracao(404, "Negócio não encontrado");
    return {
      tipo,
      ref,
      nome: d.nome,
      dealId: ref,
      companyId: d.company_id,
      leadId: null,
      dono: d.executivo_user_id ?? d.owner_user_id,
      status: STATUS[d.status] ?? "ongoing",
    };
  }
  if (tipo === "conta") {
    const { data } = await db
      .from("companies")
      .select("id, nome, owner_user_id")
      .eq("id", ref)
      .maybeSingle();
    const c = data as { nome: string; owner_user_id: string | null } | null;
    if (!c) throw new ErroIntegracao(404, "Empresa não encontrada");
    return {
      tipo,
      ref,
      nome: c.nome,
      dealId: null,
      companyId: ref,
      leadId: null,
      dono: c.owner_user_id,
      status: "ongoing",
    };
  }
  if (tipo === "contato") {
    const { data } = await db
      .from("contacts")
      .select("id, nome, company_id, companies:company_id(owner_user_id)")
      .eq("id", ref)
      .maybeSingle();
    const c = data as unknown as {
      nome: string;
      company_id: string | null;
      companies: { owner_user_id: string | null } | null;
    } | null;
    if (!c) throw new ErroIntegracao(404, "Contato não encontrado");
    let leadId: string | null = null;
    if (!c.company_id) {
      const { data: l } = await db
        .from("leads")
        .select("id")
        .eq("contact_id", ref)
        .order("created_at", { ascending: false })
        .limit(1);
      leadId = ((l ?? []) as Array<{ id: string }>)[0]?.id ?? null;
    }
    return {
      tipo,
      ref,
      nome: c.nome,
      dealId: null,
      companyId: c.company_id,
      leadId,
      dono: c.companies?.owner_user_id ?? null,
      status: "ongoing",
    };
  }
  const { data } = await db
    .from("leads")
    .select("id, name, company_id, assigned_to, executivo_id")
    .eq("id", ref)
    .maybeSingle();
  const l = data as {
    name: string;
    company_id: string | null;
    assigned_to: string | null;
    executivo_id: string | null;
  } | null;
  if (!l) throw new ErroIntegracao(404, "Lead não encontrado");
  return {
    tipo,
    ref,
    nome: l.name,
    dealId: null,
    companyId: l.company_id,
    leadId: ref,
    dono: l.executivo_id ?? l.assigned_to,
    status: "ongoing",
  };
}

/** Onde ficam os campos: o negócio; sem negócio, a empresa. */
const ondeOsCampos = (a: Alvo) =>
  a.dealId
    ? { tabela: "deals" as const, id: a.dealId }
    : a.companyId
      ? { tabela: "companies" as const, id: a.companyId }
      : null;

async function camposAtuais(db: SupabaseClient, a: Alvo): Promise<Json> {
  const onde = ondeOsCampos(a);
  if (!onde) return {};
  const { data } = await db.from(onde.tabela).select("sales_coach").eq("id", onde.id).maybeSingle();
  return ((data as { sales_coach?: Json } | null)?.sales_coach ?? {}) as Json;
}

const linkDe = (a: Alvo) =>
  a.dealId
    ? `/negocio/${a.dealId}`
    : a.leadId
      ? `/lead/${a.leadId}`
      : a.companyId
        ? `/empresas/${a.companyId}`
        : null;

async function registrarNaLinhaDoTempo(db: SupabaseClient, a: Alvo, descricao: string) {
  const agora = new Date().toISOString();
  if (a.dealId) {
    const { error } = await db.from("deal_activities").insert({
      deal_id: a.dealId,
      tipo: "reuniao",
      descricao,
      occurred_at: agora,
      author_id: null,
    } as never);
    if (error) throw new ErroIntegracao(500, error.message);
    return true;
  }
  if (a.companyId) {
    const { error } = await db.from("company_activities").insert({
      company_id: a.companyId,
      tipo: "reuniao",
      descricao,
      occurred_at: agora,
      author_id: null,
    } as never);
    if (error) throw new ErroIntegracao(500, error.message);
    return true;
  }
  if (a.leadId) {
    const { error } = await db.from("lead_notes").insert({
      lead_id: a.leadId,
      content: descricao,
      author_id: null,
    } as never);
    if (error) throw new ErroIntegracao(500, error.message);
    return true;
  }
  return false;
}

export async function acaoSalesCoach(db: SupabaseClient, b: Json): Promise<Json> {
  const acao = String(b.action ?? "");
  if (acao === "info") return { conta: "Compass · Grou" };
  if (acao === "campos") {
    const { data, error } = await db
      .from("salescoach_campos")
      .select("key, label, type, options")
      .order("criado_em");
    if (error) throw new ErroIntegracao(500, error.message);
    return { campos: data ?? [] };
  }
  if (acao === "criar_campo") {
    const label = texto(b.label, 80);
    if (!label) throw new ErroIntegracao(400, "Informe o nome do campo");
    let key = slugCampo(label);
    const { data: ja } = await db.from("salescoach_campos").select("key").like("key", `${key}%`);
    const existentes = ((ja ?? []) as Array<{ key: string }>).map((x) => x.key);
    if (existentes.includes(key)) key = `${key}_${existentes.length + 1}`;
    const campo = {
      key,
      label,
      type: texto(b.type, 20) ?? "text",
      options: Array.isArray(b.options) ? b.options.map(String).slice(0, 50) : null,
    };
    const { error } = await db.from("salescoach_campos").insert(campo as never);
    if (error) throw new ErroIntegracao(500, error.message);
    return { campo };
  }
  if (acao === "por_email") {
    const email = texto(b.email, 160);
    if (!email || !email.includes("@")) throw new ErroIntegracao(400, "Informe o e-mail");
    return { negocios: await porEmail(db, email) };
  }
  if (acao === "buscar") return { negocios: await buscar(db, String(b.termo ?? "")) };

  const id = texto(b.id, 60);
  if (!id) throw new ErroIntegracao(400, "Informe o negócio");
  const a = await alvo(db, id);

  if (acao === "negocio") {
    return { negocio: { id, name: a.nome, status: a.status, fields: await camposAtuais(db, a) } };
  }

  if (acao === "atualizar") {
    const valores = (
      b.valores && typeof b.valores === "object" && !Array.isArray(b.valores) ? b.valores : {}
    ) as Json;
    const onde = ondeOsCampos(a);
    if (!onde) return { ok: true, ignorado: "sem negócio nem empresa para guardar os campos" };
    const atual = await camposAtuais(db, a);
    const { error } = await db
      .from(onde.tabela)
      .update({
        sales_coach: { ...atual, ...valores, atualizado_em: new Date().toISOString() },
      } as never)
      .eq("id", onde.id);
    if (error) throw new ErroIntegracao(500, error.message);
    return { ok: true };
  }

  if (acao === "nota") {
    const t = texto(b.texto, 20000);
    if (!t) throw new ErroIntegracao(400, "Nota vazia");
    const ok = await registrarNaLinhaDoTempo(db, a, `Reunião analisada no Sales Coach\n\n${t}`);
    return ok ? { ok: true } : { ok: true, ignorado: "contato sem empresa nem lead" };
  }

  if (acao === "tarefa") {
    const nome = texto(b.nome, 300) ?? "Próximo passo";
    const descricao = texto(b.descricao, 2000);
    const v = texto(b.vencimento, 40);
    const vence = v && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null;
    if (a.dealId) {
      const { error } = await db
        .from("deals")
        .update({
          proximo_passo: nome,
          proximo_passo_em: vence,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", a.dealId);
      if (error) throw new ErroIntegracao(500, error.message);
    } else if (a.leadId && a.tipo === "lead") {
      const { error } = await db
        .from("leads")
        .update({ next_action: nome, next_follow_up_at: vence } as never)
        .eq("id", a.leadId);
      if (error) throw new ErroIntegracao(500, error.message);
    } else {
      const quando = vence
        ? ` (até ${new Date(vence).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })})`
        : "";
      await registrarNaLinhaDoTempo(
        db,
        a,
        `Próximo passo combinado na reunião (Sales Coach): ${nome}${quando}${descricao ? `\n\n${descricao}` : ""}`,
      );
    }
    if (a.dono) {
      const link = linkDe(a);
      await db.from("notificacoes").insert({
        user_id: a.dono,
        tipo: "sales_coach",
        titulo: `Próximo passo (Sales Coach): ${nome}`.slice(0, 200),
        corpo: [a.nome, descricao].filter(Boolean).join("\n\n").slice(0, 2000) || null,
        link,
        deal_id: a.dealId,
      } as never);
    }
    return { ok: true };
  }
  throw new ErroIntegracao(400, "Ação desconhecida");
}

/** Confere o token do Sales Coach. Devolve o id do token ou null. */
export async function tokenValido(db: SupabaseClient, auth: string): Promise<string | null> {
  const m = /^Bearer (compass_[A-Za-z0-9]{20,})$/.exec(auth.trim());
  if (!m) return null;
  const { data } = await db
    .from("integracao_tokens")
    .select("id")
    .eq("hash", hashToken(m[1]))
    .is("revogado_em", null)
    .maybeSingle();
  const id = (data as { id: string } | null)?.id ?? null;
  if (id)
    await db
      .from("integracao_tokens")
      .update({ usado_em: new Date().toISOString() } as never)
      .eq("id", id);
  return id;
}
