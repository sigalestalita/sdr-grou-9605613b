import type { supabaseAdmin } from "@/integrations/supabase/client.server";

type Admin = typeof supabaseAdmin;

/*
 * Resposta pronta para quem responder a um disparo que não deveria ter saído.
 *
 * Em 29/10 a lista do evento NR1 recebeu por engano a abertura da IA ("vi que
 * você buscou nossas soluções…"). Quem responder recebe, uma vez só, o pedido
 * de desculpas guardado em form_payload.resposta_ao_responder — sem IA e sem
 * passar pelas SDRs. A marca resposta_enviada_em é gravada antes do envio para
 * duas mensagens seguidas do lead não gerarem dois pedidos de desculpas, e
 * resposta_ate encerra a regra quando um novo disparo sai para a mesma lista.
 */
export async function enviarRespostaAoResponder(
  admin: Admin,
  leadId: string,
  conv: { id: string; account_id: string | null },
  to: string,
): Promise<boolean> {
  const { data: lead } = await admin
    .from("leads")
    .select("form_payload")
    .eq("id", leadId)
    .maybeSingle();
  const fp = (lead?.form_payload ?? {}) as Record<string, unknown>;
  const texto = typeof fp.resposta_ao_responder === "string" ? fp.resposta_ao_responder.trim() : "";
  if (!texto || fp.resposta_enviada_em || !conv.account_id) return false;
  // Vale até um horário: depois dele, a resposta já é a outro disparo.
  const ate = typeof fp.resposta_ate === "string" ? Date.parse(fp.resposta_ate) : NaN;
  if (Number.isFinite(ate) && Date.now() >= ate) return false;

  const agora = new Date().toISOString();
  const { data: marcado } = await admin
    .from("leads")
    .update({ form_payload: { ...fp, resposta_enviada_em: agora } } as never)
    .eq("id", leadId)
    .is("form_payload->resposta_enviada_em" as never, null)
    .select("id")
    .maybeSingle();
  if (!marcado) return false;

  const { data: account } = await admin
    .from("whatsapp_accounts")
    .select("*")
    .eq("id", conv.account_id)
    .maybeSingle();
  if (!account) return false;

  const { data: msg } = await admin
    .from("whatsapp_messages")
    .insert({
      conversation_id: conv.id,
      lead_id: leadId,
      sender_type: "bot",
      message_type: "text",
      body: texto,
      status: "sending",
    })
    .select("id")
    .single();

  const { getProvider } = await import("./provider-registry.server");
  try {
    const r = await getProvider(account.provider).sendMessage({
      account: {
        id: account.id,
        phone_number: account.phone_number,
        provider: account.provider,
        provider_instance_id: account.provider_instance_id,
        provider_base_url: account.provider_base_url,
        access_token: account.access_token,
        webhook_secret: account.webhook_secret,
      },
      to,
      type: "text",
      body: texto,
    });
    if (msg?.id)
      await admin
        .from("whatsapp_messages")
        .update({
          provider_message_id: r.providerMessageId,
          status: r.status === "failed" ? "failed" : "sent",
          error: r.error ?? null,
          sent_at: new Date().toISOString(),
        })
        .eq("id", msg.id);
    return r.status !== "failed";
  } catch (e) {
    if (msg?.id)
      await admin
        .from("whatsapp_messages")
        .update({ status: "failed", error: e instanceof Error ? e.message : "Falha" })
        .eq("id", msg.id);
    return false;
  }
}
