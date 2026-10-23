import { readHotAlertConfig, sendHotAlertWhatsApp } from "@/lib/lead-hot-alert.server";
import type { supabaseAdmin } from "@/integrations/supabase/client.server";

type Admin = typeof supabaseAdmin;

const APP_URL = process.env.APP_PUBLIC_URL || "https://sdr-grou.lovable.app";
const ACTION = "campaign_reply_alert";
/** Janela em dias para considerar que a resposta é de uma campanha. */
const CAMPAIGN_WINDOW_DAYS = 14;
/** Telefone gerencial que recebe cópia de todos os alertas. */
const MONITORING_PHONE = "5551999969371";

async function log(
  admin: Admin,
  status: "ok" | "error" | "skipped",
  detail: Record<string, unknown>,
) {
  try {
    await admin
      .from("integration_logs")
      .insert({ provider: "sdr_alert", action: ACTION, status, detail: detail as never });
  } catch {
    /* swallow */
  }
}

/** Já alertamos esse lead nessa campanha? (1 alerta por lead/campanha) */
async function alreadyAlerted(admin: Admin, leadId: string, campaignId: string) {
  const { data } = await admin
    .from("integration_logs")
    .select("id")
    .eq("action", ACTION)
    .eq("status", "ok")
    .contains("detail", { lead_id: leadId, campaign_id: campaignId } as never)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

/**
 * Detecta se a mensagem recebida é resposta a um disparo de campanha e,
 * se for, avisa a SDR responsável pelo lead no WhatsApp (+ monitoramento).
 *
 * Retorna `isCampaignReply` para que o webhook desligue a IA nessas conversas.
 */
export async function maybeAlertCampaignReply(params: {
  admin: Admin;
  leadId: string;
  conversationId: string;
  replyText: string | null;
  /**
   * Só detecta, sem avisar. No número espelhado a resposta já tocou no
   * celular da SDR dona do número; o aviso seria repetido.
   */
  semAviso?: boolean;
}): Promise<{ isCampaignReply: boolean }> {
  const { admin, leadId, conversationId } = params;
  const since = new Date(Date.now() - CAMPAIGN_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: cm } = await admin
    .from("whatsapp_campaign_messages")
    .select("id, campaign_id, status, sent_at, created_at")
    .eq("lead_id", leadId)
    .in("status", ["sent", "delivered", "read"])
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!cm?.campaign_id) return { isCampaignReply: false };
  const campaignId = cm.campaign_id;
  if (params.semAviso) return { isCampaignReply: true };

  if (await alreadyAlerted(admin, leadId, campaignId)) {
    return { isCampaignReply: true };
  }

  const [{ data: campaign }, { data: lead }] = await Promise.all([
    admin.from("whatsapp_campaigns").select("id, name").eq("id", campaignId).maybeSingle(),
    admin
      .from("leads")
      .select("id, name, company_name, lead_type, priority, score, position, phone, assigned_to")
      .eq("id", leadId)
      .maybeSingle(),
  ]);

  const baseDetail: Record<string, unknown> = {
    lead_id: leadId,
    campaign_id: campaignId,
    campaign_name: campaign?.name ?? null,
    conversation_id: conversationId,
    lead_name: lead?.name ?? null,
    lead_type: lead?.lead_type ?? null,
    priority: lead?.priority ?? null,
    assigned_to: lead?.assigned_to ?? null,
    reply_preview: (params.replyText ?? "").slice(0, 160) || null,
  };

  if (!lead) {
    await log(admin, "skipped", { ...baseDetail, reason: "lead_not_found" });
    return { isCampaignReply: true };
  }

  const cfg = await readHotAlertConfig();
  if (!cfg) {
    await log(admin, "error", { ...baseDetail, reason: "no_config" });
    return { isCampaignReply: true };
  }

  const company = lead.company_name?.trim() || "—";
  const role = lead.position || "—";
  const url = `${APP_URL}/lead/${lead.id}`;
  const preview = (params.replyText ?? "").replace(/\s+/g, " ").trim().slice(0, 90) || "[mídia]";
  // Texto rico numa única variável {{1}} do template HSM (mesmo padrão do alerta HOT).
  const waText =
    `${lead.phone || "—"} | ` +
    `💬 RESPONDEU campanha${campaign?.name ? ` "${campaign.name}"` : ""} | ` +
    `${lead.name} — ${company} | ` +
    `${role} | ` +
    `Score ${lead.score ?? 0} | ` +
    `"${preview}" | ` +
    url;

  const results: Record<string, unknown> = { ...baseDetail };

  const sdrPhone = lead.assigned_to ? cfg.phones?.[lead.assigned_to] : undefined;
  if (sdrPhone) {
    results.whatsapp = await sendHotAlertWhatsApp(cfg, sdrPhone, waText);
  } else {
    results.whatsapp = {
      ok: false,
      skipped: lead.assigned_to ? "no_phone_for_user" : "no_assigned_sdr",
      reason: lead.assigned_to
        ? `Nenhum telefone cadastrado para o SDR ${lead.assigned_to} nas configurações de alerta`
        : "Lead sem SDR responsável",
    };
  }

  if (MONITORING_PHONE !== sdrPhone) {
    results.whatsapp_cc = [
      { ...(await sendHotAlertWhatsApp(cfg, MONITORING_PHONE, waText)), phone: MONITORING_PHONE },
    ];
  }

  const ok =
    (results.whatsapp as { ok?: boolean } | undefined)?.ok === true ||
    ((results.whatsapp_cc as Array<{ ok?: boolean }> | undefined)?.some((r) => r.ok) ?? false);
  await log(admin, ok ? "ok" : "error", results);

  return { isCampaignReply: true };
}
