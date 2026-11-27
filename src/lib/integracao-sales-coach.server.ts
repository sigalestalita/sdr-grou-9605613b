import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/*
 * Integração com o Sales Coach (repositório salescoach-grou, conector "compass").
 *
 * O Sales Coach analisa as reuniões e chama POST /api/public/integracao com
 * "Authorization: Bearer compass_…" e { action, ..., reuniao }. Contrato do CRM
 * do Lumi (info, campos, criar_campo, por_email, buscar, negocio, atualizar,
 * nota, tarefa) mais o contexto `reuniao`: id, tipo (venda | atendimento),
 * quem conduziu, participante, data, link.
 *
 * Cada reunião analisada é uma linha de `reunioes_analisadas` — não vira
 * negócio e não sobrescreve outra reunião. Ela fica sempre na empresa (e no
 * contato/lead), e no negócio só quando é reunião de VENDA de quem é
 * responsável por um negócio aberto da empresa. Reunião de ATENDIMENTO (CS)
 * nunca toca em negócio comercial.
 *
 * O "negócio" que o Sales Coach escolhe (id) diz onde a reunião fica: um
 * negócio do Compass (uuid) ou a empresa ("conta:<id>"), o contato
 * ("contato:<id>") ou o lead ("lead:<id>").
 *
 *  - atualizar → campos da análise na reunião
 *  - nota      → resumo na reunião + uma atividade na linha do tempo do negócio
 *                (ou da empresa, ou nota do lead), assinada por quem conduziu
 *  - tarefa    → próximo passo de quem conduziu: venda → próximo passo do
 *                negócio; atendimento → tarefa do CS na ficha do cliente;
 *                lead → próxima ação do lead; senão, aviso no sino
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
const email = (v: unknown) => {
  const t = texto(v, 160)?.toLowerCase() ?? null;
  return t && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? t : null;
};
const dataIso = (v: unknown) => {
  const t = texto(v, 40);
  return t && !Number.isNaN(Date.parse(t)) ? new Date(t).toISOString() : null;
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

export type Reuniao = {
  id: string;
  tipo: "venda" | "atendimento";
  titulo: string | null;
  data: string | null;
  conduzidaPor: { email: string | null; nome: string | null };
  participante: { email: string | null; nome: string | null };
  link: string | null;
};

/** Contexto da reunião que o Sales Coach manda junto (sem ele, null). */
export function lerReuniao(v: unknown): Reuniao | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const r = v as Json;
  const id = texto(r.id, 100);
  if (!id) return null;
  const quem = (r.conduzida_por ?? {}) as Json;
  const part = (r.participante ?? {}) as Json;
  const link = texto(r.link, 500);
  return {
    id,
    tipo: r.tipo === "atendimento" ? "atendimento" : "venda",
    titulo: texto(r.titulo, 300),
    data: dataIso(r.data),
    conduzidaPor: { email: email(quem.email), nome: texto(quem.nome, 120) },
    participante: { email: email(part.email), nome: texto(part.nome, 120) },
    link: link && /^https:\/\//.test(link) ? link : null,
  };
}

type Aberto = NegocioSc & { responsavel: string | null };
export type Candidatos = {
  abertos: Aberto[];
  fechados: NegocioSc[];
  empresas: Array<{ id: string; nome: string }>;
  contatos: Array<{ id: string; nome: string }>;
  leads: Array<{ id: string; nome: string }>;
};

/**
 * Onde a reunião pode ficar, em ordem. O Sales Coach liga sozinho quando só há
 * UMA opção "ongoing"; com mais de uma, o vendedor escolhe na reunião.
 *  - atendimento: a empresa (sem empresa, o contato ou o lead) — nunca negócio;
 *  - venda de quem tem negócio aberto na empresa: esse(s) negócio(s);
 *  - venda de quem não tem: a empresa (a reunião não vira negócio);
 *  - sem saber quem conduziu: os negócios abertos; sem nenhum, a empresa.
 */
export function escolherAlvos(
  c: Candidatos,
  r: { tipo: "venda" | "atendimento" } | null,
  quem: string | null,
): NegocioSc[] {
  const pessoa: NegocioSc[] = c.empresas.length
    ? c.empresas.map((e) => ({
        id: `conta:${e.id}`,
        name: `Empresa: ${e.nome}`,
        status: "ongoing",
        fields: {},
      }))
    : c.contatos.length
      ? c.contatos.map((x) => ({
          id: `contato:${x.id}`,
          name: `Contato: ${x.nome}`,
          status: "ongoing",
          fields: {},
        }))
      : c.leads.map((x) => ({
          id: `lead:${x.id}`,
          name: `Lead: ${x.nome}`,
          status: "ongoing",
          fields: {},
        }));
  const semResp = ({ responsavel: _r, ...n }: Aberto): NegocioSc => n;
  if (r?.tipo === "atendimento") return pessoa;
  if (quem) {
    const meus = c.abertos.filter((n) => n.responsavel === quem);
    return meus.length ? meus.map(semResp) : pessoa;
  }
  return c.abertos.length ? [...c.abertos.map(semResp), ...c.fechados] : [...pessoa, ...c.fechados];
}

type LinhaNegocio = {
  id: string;
  nome: string;
  status: string;
  executivo_user_id: string | null;
  owner_user_id: string | null;
  companies: { nome: string } | null;
};

const paraNegocio = (d: LinhaNegocio): Aberto => ({
  id: d.id,
  name:
    d.companies?.nome && !d.nome.toLowerCase().includes(d.companies.nome.toLowerCase())
      ? `${d.nome} (${d.companies.nome})`
      : d.nome,
  status: STATUS[d.status] ?? "ongoing",
  fields: {},
  responsavel: d.executivo_user_id ?? d.owner_user_id,
});

/** Negócios de empresas/ids: abertos (até 20) e os fechados mais novos (até 10). */
async function negocios(
  db: SupabaseClient,
  filtro: { empresas?: string[]; ids?: string[] },
): Promise<{ abertos: Aberto[]; fechados: NegocioSc[] }> {
  if (!filtro.empresas?.length && !filtro.ids?.length) return { abertos: [], fechados: [] };
  const base = () => {
    let q = db
      .from("deals")
      .select("id, nome, status, executivo_user_id, owner_user_id, companies:company_id(nome)")
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
  const lista = (x: unknown) => ((x ?? []) as LinhaNegocio[]).map(paraNegocio);
  return {
    abertos: lista(abertos.data),
    fechados: lista(fechados.data).map(({ responsavel: _r, ...n }) => n),
  };
}

const unicos = <T>(xs: Array<T | null | undefined>) => [...new Set(xs.filter(Boolean) as T[])];

/** Quem conduziu, pelo e-mail do Sales Coach (perfil do Compass). */
async function perfilPorEmail(db: SupabaseClient, e: string | null): Promise<string | null> {
  if (!e) return null;
  const { data } = await db.from("profiles").select("id").ilike("email", exato(e)).limit(1);
  return ((data ?? []) as Array<{ id: string }>)[0]?.id ?? null;
}

async function candidatosPorEmail(db: SupabaseClient, e: string): Promise<Candidatos> {
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
  const idsEmpresas = unicos<string>([
    ...contatos.map((x) => x.company_id),
    ...leads.map((x) => x.company_id),
    ...((vinculos.data ?? []) as Array<{ company_id: string }>).map((x) => x.company_id),
  ]);
  const idsNegocios = unicos<string>([
    ...leads.map((x) => x.deal_id),
    ...((porContato.data ?? []) as Array<{ deal_id: string }>).map((x) => x.deal_id),
  ]);
  const [a, b, emp] = await Promise.all([
    negocios(db, { empresas: idsEmpresas }),
    negocios(db, { ids: idsNegocios }),
    idsEmpresas.length
      ? db.from("companies").select("id, nome").in("id", idsEmpresas.slice(0, 20)).eq("ativo", true)
      : Promise.resolve({ data: [] }),
  ]);
  const uma = <T extends { id: string }>(xs: T[]) =>
    xs.filter((o, i, s) => s.findIndex((x) => x.id === o.id) === i);
  return {
    abertos: uma([...a.abertos, ...b.abertos]),
    fechados: uma([...a.fechados, ...b.fechados]),
    empresas: (emp.data ?? []) as Array<{ id: string; nome: string }>,
    contatos: contatos.map((x) => ({ id: x.id, nome: x.nome })),
    leads: leads.map((x) => ({ id: x.id, nome: x.name })),
  };
}

export async function porEmail(
  db: SupabaseClient,
  e: string,
  r: Reuniao | null,
): Promise<NegocioSc[]> {
  const c = await candidatosPorEmail(db, e.trim().toLowerCase());
  return escolherAlvos(c, r, r ? await perfilPorEmail(db, r.conduzidaPor.email) : null);
}

export async function buscar(db: SupabaseClient, termo: string): Promise<NegocioSc[]> {
  const t = literal(termo);
  if (t.length < 2) return [];
  const [o, cs, ct] = await Promise.all([
    db.from("deals").select("id").ilike("nome", `%${t}%`).eq("exemplo", false).limit(15),
    db.from("companies").select("id, nome").ilike("nome", `%${t}%`).eq("ativo", true).limit(10),
    db
      .from("contacts")
      .select("id, nome, companies:company_id(nome)")
      .or(`nome.ilike.%${t}%,email.ilike.%${t}%`)
      .eq("ativo", true)
      .limit(10),
  ]);
  const empresas = (cs.data ?? []) as Array<{ id: string; nome: string }>;
  const [porNome, daEmpresa] = await Promise.all([
    negocios(db, { ids: ((o.data ?? []) as Array<{ id: string }>).map((x) => x.id) }),
    negocios(db, { empresas: empresas.map((x) => x.id) }),
  ]);
  const lista: NegocioSc[] = [
    ...porNome.abertos,
    ...daEmpresa.abertos,
    ...porNome.fechados,
    ...daEmpresa.fechados,
  ]
    .map((n) => ({ id: n.id, name: n.name, status: n.status, fields: {} }))
    .filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i);
  for (const x of empresas)
    lista.push({ id: `conta:${x.id}`, name: `Empresa: ${x.nome}`, status: "ongoing", fields: {} });
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
  nome: string;
  status: string;
  dealId: string | null;
  companyId: string | null;
  contactId: string | null;
  leadId: string | null;
  responsavel: string | null;
};

/** Onde a reunião fica: negócio, empresa, contato ou lead (com a empresa de cada um). */
export async function alvo(db: SupabaseClient, id: string): Promise<Alvo> {
  const { tipo, ref } = lerId(id);
  if (tipo === "negocio") {
    const { data } = await db
      .from("deals")
      .select("nome, status, company_id, contact_id, executivo_user_id, owner_user_id")
      .eq("id", ref)
      .maybeSingle();
    const d = data as {
      nome: string;
      status: string;
      company_id: string | null;
      contact_id: string | null;
      executivo_user_id: string | null;
      owner_user_id: string | null;
    } | null;
    if (!d) throw new ErroIntegracao(404, "Negócio não encontrado");
    return {
      tipo,
      nome: d.nome,
      status: STATUS[d.status] ?? "ongoing",
      dealId: ref,
      companyId: d.company_id,
      contactId: d.contact_id,
      leadId: null,
      responsavel: d.executivo_user_id ?? d.owner_user_id,
    };
  }
  if (tipo === "conta") {
    const { data } = await db
      .from("companies")
      .select("nome, owner_user_id")
      .eq("id", ref)
      .maybeSingle();
    const c = data as { nome: string; owner_user_id: string | null } | null;
    if (!c) throw new ErroIntegracao(404, "Empresa não encontrada");
    return {
      tipo,
      nome: c.nome,
      status: "ongoing",
      dealId: null,
      companyId: ref,
      contactId: null,
      leadId: null,
      responsavel: c.owner_user_id,
    };
  }
  if (tipo === "contato") {
    const { data } = await db
      .from("contacts")
      .select("nome, company_id")
      .eq("id", ref)
      .maybeSingle();
    const c = data as { nome: string; company_id: string | null } | null;
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
      nome: c.nome,
      status: "ongoing",
      dealId: null,
      companyId: c.company_id,
      contactId: ref,
      leadId,
      responsavel: null,
    };
  }
  const { data } = await db
    .from("leads")
    .select("name, company_id, contact_id, assigned_to, executivo_id")
    .eq("id", ref)
    .maybeSingle();
  const l = data as {
    name: string;
    company_id: string | null;
    contact_id: string | null;
    assigned_to: string | null;
    executivo_id: string | null;
  } | null;
  if (!l) throw new ErroIntegracao(404, "Lead não encontrado");
  return {
    tipo,
    nome: l.name,
    status: "ongoing",
    dealId: null,
    companyId: l.company_id,
    contactId: l.contact_id,
    leadId: ref,
    responsavel: l.executivo_id ?? l.assigned_to,
  };
}

type LinhaReuniao = {
  id: string;
  campos: Json;
  conduzida_por: string | null;
  linha_do_tempo_em: string | null;
  tarefa_em: string | null;
};

async function lerLinha(db: SupabaseClient, r: Reuniao): Promise<LinhaReuniao | null> {
  const { data } = await db
    .from("reunioes_analisadas")
    .select("id, campos, conduzida_por, linha_do_tempo_em, tarefa_em")
    .eq("origem", "sales_coach")
    .eq("externo_id", r.id)
    .maybeSingle();
  return (data as LinhaReuniao | null) ?? null;
}

/**
 * Cria ou atualiza a reunião, sempre com o vínculo atual (o vendedor pode ter
 * trocado o negócio no Sales Coach) e os dados de quem conduziu.
 */
async function gravarReuniao(
  db: SupabaseClient,
  a: Alvo,
  r: Reuniao,
  patch: Json,
): Promise<LinhaReuniao> {
  const atual = await lerLinha(db, r);
  const conduzidaPor = atual?.conduzida_por ?? (await perfilPorEmail(db, r.conduzidaPor.email));
  let contactId = a.contactId;
  if (!contactId && r.participante.email) {
    let q = db.from("contacts").select("id").ilike("email", exato(r.participante.email)).limit(1);
    if (a.companyId) q = q.eq("company_id", a.companyId);
    const { data } = await q;
    contactId = ((data ?? []) as Array<{ id: string }>)[0]?.id ?? null;
  }
  const linha = {
    tipo: r.tipo,
    titulo: r.titulo,
    realizada_em: r.data,
    company_id: a.companyId,
    contact_id: contactId,
    lead_id: a.leadId,
    deal_id: a.dealId,
    conduzida_por: conduzidaPor,
    conduzida_por_email: r.conduzidaPor.email,
    conduzida_por_nome: r.conduzidaPor.nome,
    participante_email: r.participante.email,
    participante_nome: r.participante.nome,
    link: r.link,
    atualizado_em: new Date().toISOString(),
    ...patch,
  };
  const sel = "id, campos, conduzida_por, linha_do_tempo_em, tarefa_em";
  const res = atual
    ? await db
        .from("reunioes_analisadas")
        .update(linha as never)
        .eq("id", atual.id)
        .select(sel)
        .single()
    : await db
        .from("reunioes_analisadas")
        .insert({ origem: "sales_coach", externo_id: r.id, ...linha } as never)
        .select(sel)
        .single();
  if (res.error) throw new ErroIntegracao(500, res.error.message);
  return res.data as unknown as LinhaReuniao;
}

const linkDe = (a: Alvo) =>
  a.dealId
    ? `/negocio/${a.dealId}`
    : a.companyId
      ? `/empresas/${a.companyId}`
      : a.leadId
        ? `/lead/${a.leadId}`
        : null;

/** A reunião na linha do tempo: do negócio, senão da empresa, senão nota do lead. */
async function registrarNaLinhaDoTempo(
  db: SupabaseClient,
  a: Alvo,
  autor: string | null,
  descricao: string,
  quando: string,
) {
  if (a.dealId) {
    const { error } = await db.from("deal_activities").insert({
      deal_id: a.dealId,
      tipo: "reuniao",
      descricao,
      occurred_at: quando,
      author_id: autor,
    } as never);
    if (error) throw new ErroIntegracao(500, error.message);
    return true;
  }
  if (a.companyId) {
    const { error } = await db.from("company_activities").insert({
      company_id: a.companyId,
      tipo: "reuniao",
      descricao,
      occurred_at: quando,
      author_id: autor,
    } as never);
    if (error) throw new ErroIntegracao(500, error.message);
    return true;
  }
  if (a.leadId) {
    const { error } = await db
      .from("lead_notes")
      .insert({ lead_id: a.leadId, content: descricao, author_id: autor } as never);
    if (error) throw new ErroIntegracao(500, error.message);
    return true;
  }
  return false;
}

async function avisar(
  db: SupabaseClient,
  para: string | null,
  n: { titulo: string; corpo: string | null; link: string | null; dealId: string | null },
) {
  if (!para) return;
  await db.from("notificacoes").insert({
    user_id: para,
    tipo: "sales_coach",
    titulo: n.titulo.slice(0, 200),
    corpo: n.corpo?.slice(0, 2000) || null,
    link: n.link,
    deal_id: n.dealId,
  } as never);
}

const SEM_CONTEXTO =
  "O Sales Coach precisa mandar os dados da reunião. Publique a versão nova do Sales Coach (conector Compass) e reenvie.";

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
  const r = lerReuniao(b.reuniao);
  if (acao === "por_email") {
    const e = email(b.email);
    if (!e) throw new ErroIntegracao(400, "Informe o e-mail");
    return { negocios: await porEmail(db, e, r) };
  }
  if (acao === "buscar") return { negocios: await buscar(db, String(b.termo ?? "")) };

  const id = texto(b.id, 60);
  if (!id) throw new ErroIntegracao(400, "Informe o negócio");
  const a = await alvo(db, id);

  if (acao === "negocio") {
    // "Só se vazio" vale dentro da própria reunião: reunião nova começa vazia.
    const linha = r ? await lerLinha(db, r) : null;
    return { negocio: { id, name: a.nome, status: a.status, fields: linha?.campos ?? {} } };
  }
  if (acao !== "atualizar" && acao !== "nota" && acao !== "tarefa")
    throw new ErroIntegracao(400, "Ação desconhecida");
  if (!r) throw new ErroIntegracao(400, SEM_CONTEXTO);

  if (acao === "atualizar") {
    const valores = (
      b.valores && typeof b.valores === "object" && !Array.isArray(b.valores) ? b.valores : {}
    ) as Json;
    const atual = await lerLinha(db, r);
    await gravarReuniao(db, a, r, { campos: { ...(atual?.campos ?? {}), ...valores } });
    return { ok: true };
  }

  if (acao === "nota") {
    const t = texto(b.texto, 20000);
    if (!t) throw new ErroIntegracao(400, "Nota vazia");
    const linha = await gravarReuniao(db, a, r, { resumo: t });
    if (!linha.linha_do_tempo_em) {
      const cabeca = [
        `Reunião analisada no Sales Coach (${r.tipo === "atendimento" ? "atendimento" : "venda"})`,
        r.conduzidaPor.nome && !linha.conduzida_por ? `conduzida por ${r.conduzidaPor.nome}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      const ok = await registrarNaLinhaDoTempo(
        db,
        a,
        linha.conduzida_por,
        `${cabeca}\n\n${t}`,
        r.data ?? new Date().toISOString(),
      );
      if (ok)
        await db
          .from("reunioes_analisadas")
          .update({ linha_do_tempo_em: new Date().toISOString() } as never)
          .eq("id", linha.id);
    }
    return { ok: true };
  }

  // tarefa: o próximo passo é de quem conduziu a reunião
  const nome = texto(b.nome, 300) ?? "Próximo passo";
  const descricao = texto(b.descricao, 2000);
  const vence = dataIso(b.vencimento);
  const linha = await gravarReuniao(db, a, r, { proximo_passo: nome, proximo_passo_em: vence });
  if (linha.tarefa_em) return { ok: true, ja_registrada: true };
  const quem = linha.conduzida_por;
  let destino = "aviso";

  if (r.tipo === "venda" && a.dealId) {
    const { error } = await db
      .from("deals")
      .update({
        proximo_passo: nome,
        proximo_passo_em: vence,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", a.dealId);
    if (error) throw new ErroIntegracao(500, error.message);
    destino = "negocio";
    if (a.responsavel && a.responsavel !== quem)
      await avisar(db, a.responsavel, {
        titulo: `Próximo passo (Sales Coach): ${nome}`,
        corpo: [
          a.nome,
          r.conduzidaPor.nome ? `Reunião conduzida por ${r.conduzidaPor.nome}` : null,
          descricao,
        ]
          .filter(Boolean)
          .join("\n\n"),
        link: linkDe(a),
        dealId: a.dealId,
      });
  } else if (r.tipo === "atendimento" && a.companyId) {
    const { data: cli } = await db
      .from("cs_clients")
      .select("client_uid, cs_responsavel_id")
      .eq("company_id", a.companyId)
      .is("mesclado_em", null)
      .order("ativo", { ascending: false })
      .limit(1);
    const c = ((cli ?? []) as Array<{ client_uid: string; cs_responsavel_id: string | null }>)[0];
    if (c) {
      const { data: ja } = await db
        .from("cs_tasks")
        .select("id")
        .eq("source", "sales_coach")
        .eq("source_ref", r.id)
        .limit(1);
      if (!(ja ?? []).length) {
        const { error } = await db.from("cs_tasks").insert({
          client_uid: c.client_uid,
          title: nome.slice(0, 200),
          notes: descricao,
          due_at: vence ?? new Date(Date.now() + 2 * 86_400_000).toISOString(),
          owner_id: quem ?? c.cs_responsavel_id,
          task_type: "outro",
          source: "sales_coach",
          source_ref: r.id,
          status: "pendente",
          created_by: quem,
        } as never);
        if (error) throw new ErroIntegracao(500, error.message);
      }
      destino = "tarefa_cs";
    }
  } else if (a.tipo === "lead" && a.leadId) {
    const { error } = await db
      .from("leads")
      .update({ next_action: nome, next_follow_up_at: vence } as never)
      .eq("id", a.leadId);
    if (error) throw new ErroIntegracao(500, error.message);
    destino = "lead";
  }
  if (destino === "aviso")
    await avisar(db, quem ?? a.responsavel, {
      titulo: `Próximo passo (Sales Coach): ${nome}`,
      corpo: [a.nome, descricao].filter(Boolean).join("\n\n"),
      link: linkDe(a),
      dealId: null,
    });
  await db
    .from("reunioes_analisadas")
    .update({ tarefa_em: new Date().toISOString() } as never)
    .eq("id", linha.id);
  return { ok: true, destino };
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
