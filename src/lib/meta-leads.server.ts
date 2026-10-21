/*
 * Leads do Meta Ads direto no kanban, sem a planilha no meio.
 *
 * O Meta avisa o webhook (/api/public/meta/leads) a cada formulário enviado,
 * só com o id do lead; os dados vêm da Graph API com o token da página. O lead
 * passa pelo mesmo caminho da planilha (ingerirLeads), com o mesmo lead_id, e
 * por isso a planilha pode continuar ligada como rede de segurança: o que já
 * entrou por aqui ela reconhece e pula.
 *
 * Configuração (variáveis de ambiente):
 *   META_LEADS_VERIFY_TOKEN  texto combinado com o Meta ao cadastrar o webhook
 *   META_LEADS_PAGE_TOKEN    token da página (ou de usuário do sistema) com leads_retrieval
 *   META_APP_SECRET          segredo do app (já usado pelo WhatsApp) — valida a assinatura;
 *                            META_LEADS_APP_SECRET, se os leads vierem de outro app
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { ingerirLeads, type BaseDeLeads, type LeadRow } from "./sheets-sync.server";

const GRAPH = "https://graph.facebook.com/v21.0";

export function configMetaLeads() {
  return {
    verifyToken: process.env.META_LEADS_VERIFY_TOKEN?.trim() || null,
    pageToken: process.env.META_LEADS_PAGE_TOKEN?.trim() || null,
    appSecret: (process.env.META_LEADS_APP_SECRET || process.env.META_APP_SECRET)?.trim() || null,
  };
}

export function assinaturaValida(rawBody: string, header: string | null, segredo: string): boolean {
  if (!header) return false;
  const dada = header.startsWith("sha256=") ? header.slice(7) : header;
  const esperada = createHmac("sha256", segredo).update(rawBody, "utf8").digest("hex");
  try {
    const a = Buffer.from(dada, "hex");
    const b = Buffer.from(esperada, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export type AvisoDeLead = { leadgenId: string; pageId: string | null; formId: string | null };

/** Os avisos de lead dentro do corpo do webhook (objeto "page", campo "leadgen"). */
export function avisosDoWebhook(corpo: unknown): AvisoDeLead[] {
  const c = corpo as {
    entry?: Array<{
      id?: string;
      changes?: Array<{
        field?: string;
        value?: {
          leadgen_id?: string | number;
          page_id?: string | number;
          form_id?: string | number;
        };
      }>;
    }>;
  } | null;
  const out: AvisoDeLead[] = [];
  for (const e of c?.entry ?? []) {
    for (const ch of e.changes ?? []) {
      if (ch.field !== "leadgen" || !ch.value?.leadgen_id) continue;
      out.push({
        leadgenId: String(ch.value.leadgen_id),
        pageId: ch.value.page_id != null ? String(ch.value.page_id) : (e.id ?? null),
        formId: ch.value.form_id != null ? String(ch.value.form_id) : null,
      });
    }
  }
  return out;
}

export type LeadDoMeta = {
  id: string;
  created_time?: string;
  field_data?: Array<{ name?: string; values?: string[] }>;
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  form_id?: string;
  platform?: string;
  is_organic?: boolean;
};

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const limpo = (v: string | undefined | null) => {
  const s = (v ?? "").trim();
  return s && s !== "." ? s : null;
};

function normalizarTelefone(raw: string | null): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D+/g, "");
  if (!d) return null;
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return `+${d}`;
  if (d.length >= 10 && d.length <= 11) return `+55${d}`;
  return `+${d}`;
}

/**
 * Cada pergunta do formulário → campo do lead.
 *
 * As perguntas personalizadas chegam com o nome que o Meta deu a elas (o texto
 * da pergunta em minúsculas), então o casamento é pelo sentido do nome; a
 * ordem importa ("porte_da_empresa" é porte, não empresa). O tipo de lead
 * também é reconhecido pela resposta (sou_de_empresa, interesse_pessoal…),
 * que é o mesmo valor que chegava na planilha. Toda resposta fica guardada
 * em form_payload.campos_meta, casada ou não.
 */
type Campo =
  | "nome"
  | "sobrenome"
  | "email"
  | "telefone"
  | "tipo"
  | "porte"
  | "area"
  | "cargo"
  | "dor"
  | "demo_free"
  | "empresa";

export function campoDaPergunta(nome: string, valor: string): Campo | null {
  const k = semAcento(nome);
  const v = semAcento(valor);
  if (k === "first_name") return "nome";
  if (k === "full_name") return "nome";
  if (k === "last_name") return "sobrenome";
  if (k === "email" || k.includes("e-mail") || k.includes("email")) return "email";
  if (/phone|telefone|whats|celular/.test(k)) return "telefone";
  if (k === "job_title" || /cargo|funcao|posicao/.test(k)) return "cargo";
  if (/^(sou_|interesse_pessoal)/.test(v) || /tipo|pessoa_(fisica|juridica)|voce_e|perfil/.test(k))
    return "tipo";
  if (/porte|funcionario|colaborador|tamanho|empregado/.test(k)) return "porte";
  if (/demo|gratuit|free|teste/.test(k)) return "demo_free";
  if (/(^|_)area|segmento|setor|departamento/.test(k)) return "area";
  if (/(^|_)dor|desafio|problema|necessidade|objetivo/.test(k)) return "dor";
  if (k === "company_name" || /empresa/.test(k)) return "empresa";
  return null;
}

function demoFree(v: string | null): boolean | null {
  if (!v) return null;
  const t = semAcento(v);
  if (/^(sim|s|yes|y|true|1|x)$/.test(t) || t.startsWith("sim")) return true;
  if (/^(nao|n|no|false|0)$/.test(t) || t.startsWith("nao")) return false;
  return null;
}

/** Lead da Graph API → a mesma linha que a planilha produziria. */
export function leadDoMetaParaLinha(m: LeadDoMeta): LeadRow {
  const campos: Partial<Record<Campo, string>> = {};
  const brutos: Record<string, string> = {};
  for (const f of m.field_data ?? []) {
    const nome = f.name ?? "";
    const valor = limpo((f.values ?? []).join(", "));
    if (!nome || !valor) continue;
    brutos[nome] = valor;
    const campo = campoDaPergunta(nome, valor);
    if (campo && !campos[campo]) campos[campo] = valor;
  }
  const nomeCompleto = `${campos.nome ?? ""} ${campos.sobrenome ?? ""}`.trim() || "(sem nome)";
  const submittedAt = m.created_time ? new Date(m.created_time).toISOString() : null;
  const email = campos.email?.toLowerCase() ?? null;
  return {
    meta_lead_id: m.id,
    source: "meta_ads",
    channel: "meta_ads",
    payload: {
      name: nomeCompleto,
      email,
      phone: normalizarTelefone(campos.telefone ?? null),
      company_name: campos.empresa ?? null,
      position: campos.cargo ?? null,
      company_segment: campos.area ?? null,
      company_size: campos.porte ?? null,
      probable_pain: campos.dor ?? null,
      demo_free: demoFree(campos.demo_free ?? null),
      demo_free_raw: campos.demo_free ?? null,
      campaign: limpo(m.campaign_name),
      ad_name: limpo(m.ad_name),
      form_name: limpo(m.form_id),
      submitted_at: submittedAt,
      form_payload: {
        lead_id: m.id,
        via: "meta_webhook",
        form_id: limpo(m.form_id),
        lead_type: campos.tipo ?? null,
        demo_free_raw: campos.demo_free ?? null,
        ad_set: limpo(m.adset_name),
        platform: limpo(m.platform),
        is_organic: m.is_organic ?? null,
        meta_ids: {
          campaign_id: limpo(m.campaign_id),
          adset_id: limpo(m.adset_id),
          ad_id: limpo(m.ad_id),
        },
        campos_meta: brutos,
        submitted_at: submittedAt,
      },
    },
  };
}

/**
 * Busca o lead na Graph API. Nome de campanha, conjunto e anúncio pedem
 * permissão de anúncios além de leads_retrieval; sem ela o Meta recusa o
 * pedido inteiro, então tenta de novo só com o essencial.
 */
export async function buscarLeadNoMeta(
  leadgenId: string,
  token: string,
): Promise<{ ok: true; lead: LeadDoMeta } | { ok: false; erro: string }> {
  const completos =
    "id,created_time,field_data,form_id,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,platform,is_organic";
  const basicos =
    "id,created_time,field_data,form_id,ad_id,adset_id,campaign_id,platform,is_organic";
  let ultimoErro = "";
  for (const fields of [completos, basicos]) {
    const url = `${GRAPH}/${encodeURIComponent(leadgenId)}?fields=${fields}&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url).catch(() => null);
    if (!res) {
      ultimoErro = "Falha de rede ao consultar o Meta";
      continue;
    }
    const json = (await res.json().catch(() => null)) as
      | (LeadDoMeta & { error?: { message?: string; code?: number } })
      | null;
    if (res.ok && json && !json.error) return { ok: true, lead: json };
    ultimoErro = `Meta ${res.status}: ${json?.error?.message ?? "resposta inválida"}`;
  }
  return { ok: false, erro: ultimoErro };
}

/** O que a base já tem deste lead: pelo lead_id (direto ou como reconversão) e pelo email. */
async function baseDoLead(linha: LeadRow): Promise<BaseDeLeads> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const existingIds = new Set<string>();
  const porEmail: BaseDeLeads["porEmail"] = new Map();
  const id = linha.meta_lead_id;
  const [direto, comoReconversao] = await Promise.all([
    supabaseAdmin.from("leads").select("id").eq("form_payload->>lead_id", id).limit(1),
    supabaseAdmin
      .from("leads")
      .select("id")
      .contains("form_payload", { reconversoes: [{ lead_id: id }] } as never)
      .limit(1),
  ]);
  if (direto.error) throw new Error(direto.error.message);
  if (comoReconversao.error) throw new Error(comoReconversao.error.message);
  if ((direto.data?.length ?? 0) > 0 || (comoReconversao.data?.length ?? 0) > 0)
    existingIds.add(id);
  const email = linha.payload.email;
  if (email) {
    const { data, error } = await supabaseAdmin
      .from("leads")
      .select("id, email, oculto_sdr")
      .ilike("email", email.replace(/([\\%_])/g, "\\$1"))
      .limit(1);
    if (error) throw new Error(error.message);
    const l = data?.[0] as { id: string; email: string; oculto_sdr: boolean | null } | undefined;
    if (l) porEmail.set(email.toLowerCase(), { id: l.id, oculto_sdr: l.oculto_sdr });
  }
  return { existingIds, porEmail };
}

async function registrar(status: string, detail: Record<string, unknown>) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("integration_logs").insert({
    provider: "meta_leads",
    action: "receber_lead",
    status,
    detail: detail as never,
  });
}

/**
 * Um aviso do webhook → lead no kanban. Devolve ok=false quando vale o Meta
 * tentar de novo (falha ao buscar ou gravar); o erro fica no log de
 * integrações, que é o que a tela de Configurações mostra.
 */
export async function receberLeadDoMeta(aviso: AvisoDeLead) {
  const { pageToken } = configMetaLeads();
  if (!pageToken) {
    await registrar("error", { ...aviso, erro: "META_LEADS_PAGE_TOKEN não configurado" });
    return { ok: false as const, erro: "META_LEADS_PAGE_TOKEN não configurado" };
  }
  const busca = await buscarLeadNoMeta(aviso.leadgenId, pageToken);
  if (!busca.ok) {
    await registrar("error", { ...aviso, erro: busca.erro });
    return { ok: false as const, erro: busca.erro };
  }
  const linha = leadDoMetaParaLinha(busca.lead);
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const base = await baseDoLead(linha);
    const r = await ingerirLeads(supabaseAdmin, [linha], base);
    const resultado = r.inserted
      ? "novo"
      : r.reconversoes
        ? "reconversao"
        : base.existingIds.has(linha.meta_lead_id)
          ? "ja_estava"
          : "falhou";
    await registrar(resultado === "falhou" ? "error" : "ok", {
      ...aviso,
      resultado,
      nome: linha.payload.name,
      email: linha.payload.email,
      campanha: linha.payload.campaign,
      sem_campo: Object.keys(
        (linha.payload.form_payload.campos_meta as Record<string, string>) ?? {},
      ).filter((k) => !campoDaPergunta(k, "")),
      erros: r.insertErrors,
    });
    if (resultado === "falhou")
      return { ok: false as const, erro: r.insertErrors[0] ?? "Lead não gravado" };
    return { ok: true as const, resultado };
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    await registrar("error", { ...aviso, erro });
    return { ok: false as const, erro };
  }
}
