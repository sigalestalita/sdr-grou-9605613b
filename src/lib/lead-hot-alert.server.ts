import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { LEAD_TYPE_LABEL, type LeadType } from "./lead-type";
import { getProvider } from "./whatsapp/provider-registry.server";

const GATEWAY = "https://connector-gateway.lovable.dev/resend/emails";
const FROM = "Grou SDR <onboarding@resend.dev>";
const APP_URL = process.env.APP_PUBLIC_URL || "https://sdr-grou.lovable.app";

export const HOT_ALERT_SETTINGS_KEY = "sdr_hot_lead_alert";

type HotAlertConfig = {
  /** Mapa userId → telefone E.164 (só dígitos). */
  phones: Record<string, string>;
  /** ID da conta whatsapp_accounts usada para o disparo. */
  whatsapp_account_id?: string | null;
  /** Se preenchido, envia HSM; senão tenta sessão livre (só funciona se SDR falou com nosso número nas últimas 24h). */
  template_name?: string | null;
  template_language?: string | null;
  /** E-mails que devem receber o alerta HOT (além do responsável). */
  cc_emails?: string[];
};

export type HotLeadPriority = "high" | "medium";

function isHotPriority(p: unknown): p is HotLeadPriority {
  return p === "high" || p === "medium";
}

async function readConfig(): Promise<HotAlertConfig | null> {
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

async function log(status: "ok" | "error", detail: Record<string, unknown>) {
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
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!LOVABLE_API_KEY || !RESEND_API_KEY) return { ok: false, error: "missing_keys" };

  const icon = params.priority === "high" ? "🔥" : "⚡";
  const bar = params.priority === "high" ? "#dc2626" : "#f59e0b";
  const label = params.priority === "high" ? "ALTA PRIORIDADE" : "MÉDIA PRIORIDADE";
  const url = `${APP_URL}/lead/${params.leadId}`;

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f5f6f8;padding:24px;">
      <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
        <div style="background:${bar};color:#fff;padding:14px 24px;font-weight:700;font-size:15px;">
          ${icon} ${label} — Empresa
        </div>
        <div style="padding:24px;">
          <h2 style="margin:0 0 4px 0;font-size:18px;color:#111827;">${escapeHtml(params.name)}</h2>
          <p style="margin:0 0 16px 0;color:#6b7280;">${escapeHtml(params.company)} · ${LEAD_TYPE_LABEL[params.leadType]} · Score ${params.score}</p>
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
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${(await res.text()).slice(0, 300)}` };
  return { ok: true };
}

async function sendWhatsApp(cfg: HotAlertConfig, phone: string, text: string) {
  if (!cfg.whatsapp_account_id) return { ok: false, error: "whatsapp_account_id_missing" };
  const { data: acc } = await supabaseAdmin
    .from("whatsapp_accounts")
    .select("id, phone_number, provider, provider_instance_id, provider_base_url, access_token, webhook_secret")
    .eq("id", cfg.whatsapp_account_id)
    .maybeSingle();
  if (!acc) return { ok: false, error: "whatsapp_account_not_found" };

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
  return result.status === "failed"
    ? { ok: false, error: result.error ?? "provider_failed" }
    : { ok: true };
}

export async function maybeAlertHotLead(leadId: string) {
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("id, name, company_name, lead_type, priority, score, assigned_to, phone, position")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return;
  if (lead.lead_type !== "empresa") return;
  if (!isHotPriority(lead.priority)) return;
  if (!lead.assigned_to) return;
  if (await alreadyAlerted(lead.id)) return;

  const cfg = await readConfig();

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
  const icon = priority === "high" ? "🔥" : "⚡";
  const label = priority === "high" ? "ALTA" : "MÉDIA";
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
    lead_id: lead.id,
    priority,
    assigned_to: lead.assigned_to,
  };

  // Email
  if (toEmails.length > 0) {
    const r = await sendEmail({
      to: toEmails,
      leadId: lead.id,
      name: lead.name,
      company,
      leadType: "empresa",
      score: lead.score ?? 0,
      priority,
    });
    results.email = r;
  } else {
    results.email = { skipped: "no_recipient" };
  }

  // WhatsApp para o SDR responsável
  const phone = cfg?.phones?.[lead.assigned_to];
  if (phone && cfg) {
    results.whatsapp = await sendWhatsApp(cfg, phone, waText);
  } else {
    results.whatsapp = { skipped: cfg ? "no_phone_for_user" : "no_config" };
  }

  const anyOk =
    (results.email as { ok?: boolean } | undefined)?.ok ||
    (results.whatsapp as { ok?: boolean } | undefined)?.ok;
  await log(anyOk ? "ok" : "error", results);
}