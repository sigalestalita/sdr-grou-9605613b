import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { LEAD_TYPE_LABEL, type LeadType } from "./lead-type";
import { getProvider } from "./whatsapp/provider-registry.server";

const GATEWAY = "https://connector-gateway.lovable.dev/resend/emails";
const FROM = "Grou SDR <sdr@grougp.com.br>";
const APP_URL = process.env.APP_PUBLIC_URL || "https://sdr-grou.lovable.app";

export const HOT_ALERT_SETTINGS_KEY = "sdr_hot_lead_alert";

// Mariana Borges atende exclusivamente CONSULTORIA.
// As demais SDRs (Camila, Lisiane) recebem apenas EMPRESA/PESSOA_FISICA.
const MARIANA_USER_ID = "81068193-826f-42e8-8670-df87fcdfecf5";

export type HotAlertConfig = {
  /** Mapa userId → telefone E.164 (só dígitos). */
  phones: Record<string, string>;
  /** ID da conta whatsapp_accounts usada para o disparo. */
  whatsapp_account_id?: string | null;
  /** Se preenchido, envia HSM; senão tenta sessão livre (só funciona se SDR falou com nosso número nas últimas 24h). */
  template_name?: string | null;
  template_language?: string | null;
  /** E-mails que devem receber o alerta HOT (além do responsável). */
  cc_emails?: string[];
  /** Telefones (E.164 só dígitos) que também recebem alerta WhatsApp para leads empresa/pessoa_fisica. */
  empresa_cc_phones?: string[];
};

export type HotLeadPriority = "alta" | "media";

function isHotPriority(p: unknown): p is HotLeadPriority {
  return p === "alta" || p === "media";
}

export async function readHotAlertConfig(): Promise<HotAlertConfig | null> {
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", HOT_ALERT_SETTINGS_KEY)
    .maybeSingle();
  const raw = data?.value as HotAlertConfig | null | undefined;
  if (!raw || typeof raw !== "object") return null;
  return {
    phones: raw.phones && typeof raw.phones === "object" ? raw.phones : {},
    whatsapp_account_id: raw.whatsapp_account_id ?? null,
    template_name: raw.template_name ?? null,
    template_language: raw.template_language ?? "pt_BR",
    cc_emails: Array.isArray(raw.cc_emails) ? raw.cc_emails : [],
    empresa_cc_phones: Array.isArray(raw.empresa_cc_phones) ? raw.empresa_cc_phones : [],
  };
}

async function alreadyAlerted(leadId: string) {
  const { data } = await supabaseAdmin
    .from("integration_logs")
    .select("id")
    .eq("action", "hot_lead_alert")
    .eq("status", "ok")
    .contains("detail", { lead_id: leadId } as never)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

async function log(status: "ok" | "error" | "skipped", detail: Record<string, unknown>) {
  try {
    await supabaseAdmin
      .from("integration_logs")
      .insert({ provider: "sdr_alert", action: "hot_lead_alert", status, detail: detail as never });
  } catch {
    /* swallow */
  }
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function sendEmail(params: {
  to: string[];
  leadId: string;
  name: string;
  company: string;
  leadType: LeadType;
  score: number;
  priority: HotLeadPriority;
}) {
  const started = Date.now();
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!LOVABLE_API_KEY || !RESEND_API_KEY) {
    return { ok: false, error: "missing_keys", to: params.to, ms: 0 };
  }

  const icon = params.priority === "alta" ? "🔥" : "⚡";
  const bar = params.priority === "alta" ? "#dc2626" : "#f59e0b";
  const label = params.priority === "alta" ? "ALTA PRIORIDADE" : "MÉDIA PRIORIDADE";
  const typeLabel = LEAD_TYPE_LABEL[params.leadType];
  const url = `${APP_URL}/lead/${params.leadId}`;

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f5f6f8;padding:24px;">
      <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
        <div style="background:${bar};color:#fff;padding:14px 24px;font-weight:700;font-size:15px;">
          ${icon} ${label} — ${typeLabel}
        </div>
        <div style="padding:24px;">
          <h2 style="margin:0 0 4px 0;font-size:18px;color:#111827;">${escapeHtml(params.name)}</h2>
          <p style="margin:0 0 16px 0;color:#6b7280;">${escapeHtml(params.company)} · ${typeLabel} · Score ${params.score}</p>
          <a href="${url}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;">Abrir lead agora</a>
        </div>
      </div>
    </div>`;

  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": RESEND_API_KEY,
    },
    body: JSON.stringify({
      from: FROM,
      to: params.to,
      subject: `${icon} ${label}: ${params.name} — ${params.company}`,
      html,
    }),
  });
  const ms = Date.now() - started;
  if (!res.ok) {
    return { ok: false, error: `HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`, to: params.to, ms };
  }
  let messageId: string | undefined;
  try {
    const body = (await res.json()) as { id?: string };
    messageId = body?.id;
  } catch { /* ignore */ }
  return { ok: true, to: params.to, ms, message_id: messageId };
}

export async function sendHotAlertWhatsApp(cfg: HotAlertConfig, phone: string, text: string) {
  const started = Date.now();
  if (!cfg.whatsapp_account_id) return { ok: false, error: "whatsapp_account_id_missing", phone, ms: 0 };
  const { data: acc } = await supabaseAdmin
    .from("whatsapp_accounts")
    .select("id, phone_number, provider, provider_instance_id, provider_base_url, access_token, webhook_secret")
    .eq("id", cfg.whatsapp_account_id)
    .maybeSingle();
  if (!acc) return { ok: false, error: "whatsapp_account_not_found", phone, ms: Date.now() - started };

  const provider = getProvider(acc.provider);
  const useTemplate = !!cfg.template_name;
  const result = await provider.sendMessage({
    account: acc as never,
    to: phone,
    type: useTemplate ? "template" : "text",
    body: useTemplate ? undefined : text,
    templateName: cfg.template_name ?? undefined,
    templateLanguage: cfg.template_language ?? "pt_BR",
    templateParams: useTemplate ? [text] : undefined,
  });
  const ms = Date.now() - started;
  const mode = useTemplate ? `template:${cfg.template_name}` : "free_text";
  if (result.status === "failed") {
    return { ok: false, error: result.error ?? "provider_failed", phone, mode, ms };
  }
  return { ok: true, phone, mode, ms, provider_message_id: (result as { providerMessageId?: string }).providerMessageId };
}

export async function maybeAlertHotLead(leadId: string, opts?: { force?: boolean }) {
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("id, name, company_name, lead_type, priority, score, assigned_to, phone, position")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) {
    await log("skipped", { lead_id: leadId, reason: "lead_not_found" });
    return;
  }
  const baseDetail = {
    lead_id: lead.id,
    lead_name: lead.name,
    lead_type: lead.lead_type,
    priority: lead.priority,
    score: lead.score ?? 0,
    assigned_to: lead.assigned_to,
  };
  if (!isHotPriority(lead.priority)) {
    await log("skipped", { ...baseDetail, reason: "not_hot_priority" });
    return;
  }
  if (!lead.assigned_to) {
    await log("skipped", { ...baseDetail, reason: "no_assigned_sdr" });
    return;
  }

  // Regra de escopo por SDR/tipo:
  // - Mariana Borges: SOMENTE leads de consultoria.
  // - Demais SDRs: SOMENTE leads de empresa/pessoa_fisica (não consultoria).
  const isMariana = lead.assigned_to === MARIANA_USER_ID;
  const isConsultoria = lead.lead_type === "consultoria";
  if (isMariana && !isConsultoria) {
    await log("skipped", { ...baseDetail, reason: "mariana_only_consultoria" });
    return;
  }
  if (!isMariana && isConsultoria) {
    await log("skipped", { ...baseDetail, reason: "consultoria_only_mariana" });
    return;
  }
  if (!isMariana && lead.lead_type !== "empresa" && lead.lead_type !== "pessoa_fisica") {
    await log("skipped", { ...baseDetail, reason: "lead_type_out_of_scope" });
    return;
  }
  if (!opts?.force && (await alreadyAlerted(lead.id))) {
    await log("skipped", { ...baseDetail, reason: "already_alerted" });
    return;
  }

  const cfg = await readHotAlertConfig();

  // Descobre e-mail do SDR responsável
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("email, full_name")
    .eq("id", lead.assigned_to)
    .maybeSingle();
  const toEmails = [profile?.email, ...(cfg?.cc_emails ?? [])].filter(
    (v): v is string => !!v && v.includes("@"),
  );

  const priority = lead.priority as HotLeadPriority;
  const company = lead.company_name?.trim() || "—";
  const url = `${APP_URL}/lead/${lead.id}`;
  const icon = priority === "alta" ? "🔥" : "⚡";
  const label = priority === "alta" ? "ALTA" : "MÉDIA";
  const role = lead.position || "—";
  const phoneLead = lead.phone || "—";
  // String rica que cabe em uma única variável {{1}} do template HSM,
  // e também renderiza bem como mensagem livre quando a janela de 24h está aberta.
  const waText =
    `${phoneLead} | ` +
    `${icon} ${label} prioridade | ` +
    `${lead.name} — ${company} | ` +
    `${role} | ` +
    `Score ${lead.score ?? 0} | ` +
    url;

  const results: Record<string, unknown> = {
    ...baseDetail,
    priority,
    assigned_to_email: profile?.email ?? null,
    assigned_to_name: profile?.full_name ?? null,
    cc_emails: cfg?.cc_emails ?? [],
  };

  // Email
  if (toEmails.length > 0) {
    const r = await sendEmail({
      to: toEmails,
      leadId: lead.id,
      name: lead.name,
      company,
      leadType: lead.lead_type as LeadType,
      score: lead.score ?? 0,
      priority,
    });
    results.email = r;
  } else {
    results.email = { ok: false, skipped: "no_recipient", reason: "SDR sem e-mail em profiles e sem cc_emails configurado" };
  }

  // WhatsApp para o SDR responsável
  const phone = cfg?.phones?.[lead.assigned_to];
  if (phone && cfg) {
    results.whatsapp = await sendHotAlertWhatsApp(cfg, phone, waText);
  } else {
    results.whatsapp = {
      ok: false,
      skipped: cfg ? "no_phone_for_user" : "no_config",
      reason: cfg
        ? `Nenhum telefone cadastrado em app_settings.${HOT_ALERT_SETTINGS_KEY}.phones para o SDR ${lead.assigned_to}`
        : `Chave ${HOT_ALERT_SETTINGS_KEY} não encontrada em app_settings`,
    };
  }

  // Cópia extra de WhatsApp para leads empresa/pessoa_fisica (monitoramento gerencial)
  if (cfg && !isMariana && (lead.lead_type === "empresa" || lead.lead_type === "pessoa_fisica")) {
    const extras = (cfg.empresa_cc_phones ?? []).filter((p) => !!p && p !== phone);
    if (extras.length > 0) {
      const extraResults: Array<Record<string, unknown>> = [];
      for (const p of extras) {
        const r = await sendHotAlertWhatsApp(cfg, p, waText);
        extraResults.push({ ...r, phone: p });
      }
      results.whatsapp_cc = extraResults;
    }
  }

  const anyOk =
    (results.email as { ok?: boolean } | undefined)?.ok ||
    (results.whatsapp as { ok?: boolean } | undefined)?.ok;
  await log(anyOk ? "ok" : "error", results);
}

/**
 * Envia SOMENTE para um telefone de monitoramento (sem tocar SDR/e-mail).
 * Usado para reenvio pontual a um número extra.
 */
export async function sendMonitoringHotAlert(leadId: string, phone: string) {
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("id, name, company_name, lead_type, priority, score, phone, position")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) {
    await log("skipped", { lead_id: leadId, reason: "lead_not_found", monitoring_phone: phone });
    return { ok: false, error: "lead_not_found" };
  }
  if (!isHotPriority(lead.priority)) {
    await log("skipped", { lead_id: leadId, reason: "not_hot_priority", monitoring_phone: phone });
    return { ok: false, error: "not_hot_priority" };
  }
  const cfg = await readHotAlertConfig();
  if (!cfg) return { ok: false, error: "no_config" };
  const priority = lead.priority as HotLeadPriority;
  const company = lead.company_name?.trim() || "—";
  const url = `${APP_URL}/lead/${lead.id}`;
  const icon = priority === "alta" ? "🔥" : "⚡";
  const label = priority === "alta" ? "ALTA" : "MÉDIA";
  const role = lead.position || "—";
  const phoneLead = lead.phone || "—";
  const waText =
    `${phoneLead} | ${icon} ${label} prioridade | ${lead.name} — ${company} | ${role} | Score ${lead.score ?? 0} | ${url}`;
  const r = await sendHotAlertWhatsApp(cfg, phone, waText);
  await log(r.ok ? "ok" : "error", {
    lead_id: lead.id,
    lead_name: lead.name,
    lead_type: lead.lead_type,
    priority,
    monitoring_only: true,
    whatsapp: { ...r, phone },
  });
  return r;
}