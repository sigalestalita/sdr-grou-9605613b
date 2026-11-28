/*
 * Suporte pela IA do CS no número pessoal (coexistência).
 *
 * A promessa da aba de Tickets: quando um cliente pede suporte, a IA atende até
 * onde o playbook cobre e, se não resolver, abre ticket e passa para uma pessoa.
 * No número da Grou isso já acontecia. No número pessoal de quem é do CS não
 * acontecia: o cliente quase nunca é lead, e a conversa parava antes da IA.
 *
 * Aqui o número é da pessoa, então a IA é mais contida que no número da Grou:
 *  - só fala com quem é cliente (contato ativo no cliente, pelo telefone);
 *  - só responde pedido de suporte (dúvida de uso, erro, configuração, acesso,
 *    reclamação). Conversa de relacionamento, combinados e agradecimentos ficam
 *    para o dono do número, sem resposta da IA;
 *  - sai quando o dono do número escreveu na conversa nas últimas 24 horas;
 *  - abriu ticket, passou para humano: a conversa fica "aguardando" e a IA não
 *    volta até alguém responder.
 * A conversa continua na caixa e com o dono do número: não muda de área nem de
 * responsável, só fica ligada ao cliente.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export const HORAS_DO_DONO = 24;

/** O dono do número escreveu (pelo celular ou pelo Compass) há pouco? */
export function donoFalouHaPouco(
  mensagens: Array<{ sender_type: string; created_at: string }>,
  agora = Date.now(),
): boolean {
  const limite = agora - HORAS_DO_DONO * 3600 * 1000;
  return mensagens.some(
    (m) =>
      ["sdr", "agent", "human"].includes(m.sender_type) &&
      new Date(m.created_at).getTime() >= limite,
  );
}

export async function atenderSuporteNoNumeroPessoal(
  admin: Admin,
  args: {
    conversaId: string;
    cliente: { clientUid: string; nomeEmpresa: string };
    conta: Record<string, unknown> & { provider: string };
    telefone: string;
    leadId: string | null;
  },
): Promise<void> {
  // Liga a conversa ao cliente, sem tirá-la da caixa de quem é dono do número.
  const { data: conv } = await admin
    .from("whatsapp_conversations")
    .select("id, status, client_uid")
    .eq("id", args.conversaId)
    .maybeSingle();
  if (!conv) return;
  if (!conv.client_uid) {
    await admin
      .from("whatsapp_conversations")
      .update({ client_uid: args.cliente.clientUid } as never)
      .eq("id", conv.id);
  }

  const { lerConfigIaCs, responderComoCs } = await import("@/lib/cs-ai.functions");
  const cfg = await lerConfigIaCs(admin);
  if (!cfg.enabled || !cfg.autoReplyEnabled) return;

  // Já passou para uma pessoa (ticket aberto, bastão) ou foi encerrada.
  if (conv.status !== "open") return;

  const desde = new Date(Date.now() - HORAS_DO_DONO * 3600 * 1000).toISOString();
  const { data: recentes } = await admin
    .from("whatsapp_messages")
    .select("sender_type, created_at")
    .eq("conversation_id", conv.id)
    .gte("created_at", desde);
  if (donoFalouHaPouco(recentes ?? [])) return;

  const r = await responderComoCs(admin, conv.id, { numeroPessoal: true });
  if (!r) return;
  await enviarRespostaDaIaCs(admin, { ...args, conversaId: conv.id, resposta: r });

  // Abriu ticket: dali em diante é com gente. A IA não responde mais nessa conversa.
  if (r.ticket != null) {
    await admin
      .from("whatsapp_conversations")
      .update({ status: "pending" } as never)
      .eq("id", conv.id);
  }
}

/** Grava e envia a resposta da IA do CS pelo número em que a conversa está. */
export async function enviarRespostaDaIaCs(
  admin: Admin,
  args: {
    conversaId: string;
    conta: Record<string, unknown> & { provider: string };
    telefone: string;
    leadId: string | null;
    resposta: { resposta: string; ticket: number | null };
  },
) {
  const { getProvider } = await import("@/lib/whatsapp/provider-registry.server");
  const provider = getProvider(args.conta.provider as never);
  const registro = await admin
    .from("whatsapp_messages")
    .insert({
      conversation_id: args.conversaId,
      lead_id: args.leadId,
      sender_type: "bot",
      message_type: "text",
      body: args.resposta.resposta,
      metadata: { source: "cs_ai", ticket: args.resposta.ticket },
      status: "sending",
    })
    .select("id")
    .single();

  const envio = await provider.sendMessage({
    account: args.conta as never,
    to: args.telefone,
    type: "text",
    body: args.resposta.resposta,
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

  await admin
    .from("whatsapp_conversations")
    .update({
      last_message_at: new Date().toISOString(),
      last_preview: args.resposta.resposta.slice(0, 200),
    })
    .eq("id", args.conversaId);
}
