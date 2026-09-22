/*
 * Encerra com educação quem escreveu procurando vaga.
 *
 * Responde para onde mandar o currículo, encerra a conversa e manda o card
 * para desqualificado com o motivo "Sem perfil". É decisão automática com
 * consequência no funil, então fica registrada na timeline do lead: dá para
 * conferir depois por que aquele card saiu.
 */

import { MOTIVOS_DE_DESCARTE } from "@/lib/leads/motivos-descarte";

export async function encerrarComoCandidato({
  admin,
  accountConfig,
  conversaId,
  leadId,
  telefone,
  nomeDoLead,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  accountConfig: any;
  conversaId: string;
  leadId: string;
  telefone: string;
  nomeDoLead: string | null;
}): Promise<void> {
  const { respostaParaCandidato, EMAIL_DE_RH } = await import("./busca-emprego");
  const texto = respostaParaCandidato(nomeDoLead);

  const { getProvider } = await import("./provider-registry.server");
  const provider = getProvider(accountConfig.provider);

  const registro = await admin
    .from("whatsapp_messages")
    .insert({
      conversation_id: conversaId,
      lead_id: leadId,
      sender_type: "bot",
      message_type: "text",
      body: texto,
      metadata: { source: "ai_candidato_rh" },
      status: "sending",
    })
    .select("id")
    .single();

  const envio = await provider.sendMessage({
    account: accountConfig,
    to: telefone,
    type: "text",
    body: texto,
  });

  await admin
    .from("whatsapp_messages")
    .update({
      provider_message_id: envio.providerMessageId || null,
      status: envio.status === "failed" ? "failed" : "sent",
      error: envio.error ?? null,
      sent_at: new Date().toISOString(),
    })
    .eq("id", registro.data?.id ?? "00000000-0000-0000-0000-000000000000");

  const agora = new Date().toISOString();
  await admin
    .from("whatsapp_conversations")
    .update({ status: "closed", last_message_at: agora, last_preview: texto.slice(0, 200) })
    .eq("id", conversaId);

  const motivo = MOTIVOS_DE_DESCARTE[0]; // "Sem perfil"
  await admin.from("leads").update({ lost_reason: motivo, last_action_at: agora }).eq("id", leadId);

  const { moverEtapaDoLead } = await import("./automations-engine.server");
  await moverEtapaDoLead(leadId, "desqualificado");

  await admin.from("lead_interactions").insert({
    lead_id: leadId,
    author_id: null,
    type: "routing",
    content: `Pessoa procurando vaga: respondemos com o e-mail do RH (${EMAIL_DE_RH}) e o lead foi desqualificado.`,
    metadata: { source: "ai_candidato_rh", lost_reason: motivo },
  });
}
