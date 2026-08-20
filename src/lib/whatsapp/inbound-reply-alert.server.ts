import { readHotAlertConfig, sendHotAlertWhatsApp } from "@/lib/lead-hot-alert.server";
import type { supabaseAdmin } from "@/integrations/supabase/client.server";

type Admin = typeof supabaseAdmin;

const APP_URL = process.env.APP_PUBLIC_URL || "https://sdr-grou.lovable.app";
const ACTION = "inbound_reply_alert";
/** Telefone gerencial que recebe cópia dos alertas. */
const MONITORING_PHONE = "5551999969371";
/** Padrão: no máximo 1 aviso por conversa a cada 30 min. */
const DEFAULT_COOLDOWN_MINUTES = 30;

export const INBOUND_ALERT_SETTINGS_KEY = "sdr_inbound_reply_alert";

type InboundAlertConfig = {
  enabled: boolean;
  cooldownMinutes: number;
  monitoringCopy: boolean;
};

async function readConfig(admin: Admin): Promise<InboundAlertConfig> {
  const { data } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", INBOUND_ALERT_SETTINGS_KEY)
    .maybeSingle();
  const raw = (data?.value ?? {}) as Record<string, unknown>;
  return {
    enabled: raw.enabled !== false,
    cooldownMinutes:
      typeof raw.cooldownMinutes === "number" && raw.cooldownMinutes >= 0
        ? raw.cooldownMinutes
        : DEFAULT_COOLDOWN_MINUTES,
    monitoringCopy: raw.monitoringCopy !== false,
  };
}

async function log(admin: Admin, status: "ok" | "error" | "skipped", detail: Record<string, unknown>) {
  try {
    await admin
      .from("integration_logs")
      .insert({ provider: "sdr_alert", action: ACTION, status, detail: detail as never });
  } catch {
    /* swallow */
  }
}

/** Já avisamos essa conversa dentro da janela de cooldown? */
async function alertedRecently(admin: Admin, conversationId: string, cooldownMinutes: number) {
  if (cooldownMinutes <= 0) return false;
  const since = new Date(Date.now() - cooldownMinutes * 60 * 1000).toISOString();
  const { data } = await admin
    .from("integration_logs")
    .select("id")
    .eq("action", ACTION)
    .eq("status", "ok")
    .gte("created_at", since)
    .contains("detail", { conversation_id: conversationId } as never)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

/**
 * Avisa no WhatsApp da própria SDR quando o lead responde no inbox.
 * Usa a mesma mecânica/HSM do alerta de lead HOT.
 */
export async function maybeAlertInboundReply(params: {
  admin: Admin;
  leadId: string;
  conversationId: string;
  assignedUserId: string | null;
  replyText: string | null;
  messageType: string;
}): Promise<void> {
  const { admin, leadId, conversationId } = params;

  const cfgAlert = await readConfig(admin);
  const baseDetail: Record<string, unknown> = {
    lead_id: leadId,
    conversation_id: conversationId,
    assigned_to: params.assignedUserId,
    reply_preview: (params.replyText ?? "").slice(0, 160) || `[${params.messageType}]`,
  };

  if (!cfgAlert.enabled) {
    await log(admin, "skipped", { ...baseDetail, reason: "disabled" });
    return;
  }
  if (await alertedRecently(admin, conversationId, cfgAlert.cooldownMinutes)) {
    await log(admin, "skipped", { ...baseDetail, reason: "cooldown" });
    return;
  }

  const { data: lead } = await admin
    .from("leads")
    .select("id, name, company_name, position, phone, priority, score, lead_type, assigned_to")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) {
    await log(admin, "skipped", { ...baseDetail, reason: "lead_not_found" });
    return;
  }

  const cfg = await readHotAlertConfig();
  if (!cfg) {
    await log(admin, "error", { ...baseDetail, reason: "no_config" });
    return;
  }

  const ownerId = params.assignedUserId ?? lead.assigned_to ?? null;
  const company = lead.company_name?.trim() || "—";
  const role = lead.position || "—";
  const preview =
    (params.replyText ?? "").replace(/\s+/g, " ").trim().slice(0, 90) || `[${params.messageType}]`;
  const waText =
    `${lead.phone || "—"} | ` +
    `💬 RESPONDEU no WhatsApp | ` +
    `${lead.name} — ${company} | ` +
    `${role} | ` +
    `Score ${lead.score ?? 0} | ` +
    `"${preview}" | ` +
    `${APP_URL}/whatsapp?c=${conversationId}`;

  const results: Record<string, unknown> = { ...baseDetail, owner_id: ownerId };

  const sdrPhone = ownerId ? cfg.phones?.[ownerId] : undefined;
  if (sdrPhone) {
    results.whatsapp = await sendHotAlertWhatsApp(cfg, sdrPhone, waText);
  } else {
    results.whatsapp = {
      ok: false,
      skipped: ownerId ? "no_phone_for_user" : "no_assigned_sdr",
      reason: ownerId
        ? `Nenhum telefone cadastrado para o SDR ${ownerId} nas configurações de alerta`
        : "Conversa sem SDR responsável",
    };
  }

  if (cfgAlert.monitoringCopy && MONITORING_PHONE !== sdrPhone) {
    results.whatsapp_cc = [
      { ...(await sendHotAlertWhatsApp(cfg, MONITORING_PHONE, waText)), phone: MONITORING_PHONE },
    ];
  }

  const ok =
    (results.whatsapp as { ok?: boolean } | undefined)?.ok === true ||
    ((results.whatsapp_cc as Array<{ ok?: boolean }> | undefined)?.some((r) => r.ok) ?? false);
  await log(admin, ok ? "ok" : "error", results);
}
