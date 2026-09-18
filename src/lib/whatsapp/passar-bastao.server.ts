/*
 * Passar o bastão para uma pessoa.
 *
 * Existiam dois caminhos até aqui — a decisão de handoff e a resposta que
 * promete alguém — e só o primeiro transferia de verdade. Era assim que a IA
 * avisava "a pessoa especialista vai te chamar" sem que ninguém assumisse, e
 * na mensagem seguinte avisava de novo.
 *
 * Com a transferência num lugar só, prometer e cumprir andam juntos.
 */

export async function passarBastaoParaHumano({
  admin,
  conversaId,
  leadId,
  donoDoBastao,
  motivo,
  preview,
  unreadCount,
  origem,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any;
  conversaId: string;
  leadId: string;
  donoDoBastao: string;
  motivo: string;
  preview: string;
  unreadCount: number;
  origem: string;
}): Promise<void> {
  const agora = new Date().toISOString();

  await admin
    .from("whatsapp_conversations")
    .update({
      assigned_user_id: donoDoBastao,
      status: "pending",
      unread_count: unreadCount,
      last_message_at: agora,
      last_preview: preview.slice(0, 200),
    })
    .eq("id", conversaId);

  await admin
    .from("leads")
    .update({ assigned_to: donoDoBastao, last_action_at: agora })
    .eq("id", leadId);

  // O card sai de "Em qualificação" e vai para "Em contato", que é o marco de
  // primeira abordagem humana no kanban.
  const { moverEtapaDoLead } = await import("./automations-engine.server");
  await moverEtapaDoLead(leadId, "em_contato");

  await admin.from("lead_interactions").insert({
    lead_id: leadId,
    author_id: null,
    type: "routing",
    content: "Lead transferido automaticamente da IA para atendimento humano.",
    metadata: { assignee_user_id: donoDoBastao, source: origem, reason: motivo },
  });
}
