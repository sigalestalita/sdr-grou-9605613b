import { decidirResposta, type Decisao } from "./resposta-unica";

/*
 * Lê o fim da conversa e pergunta ao decisor se ainda é hora de responder.
 *
 * São poucas linhas, pelo índice de conversation_id: barato o suficiente para
 * ser consultado duas vezes por mensagem recebida.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cliente = { from: (tabela: string) => any };

export async function podeResponderAgora(
  db: Cliente,
  conversaId: string,
  providerMessageId: string | null | undefined,
): Promise<Decisao> {
  const { data, error } = await db
    .from("whatsapp_messages")
    .select("sender_type, provider_message_id, created_at")
    .eq("conversation_id", conversaId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) return { responder: true, motivo: "Não deu para conferir o histórico; segue." };
  return decidirResposta(data ?? [], providerMessageId);
}
