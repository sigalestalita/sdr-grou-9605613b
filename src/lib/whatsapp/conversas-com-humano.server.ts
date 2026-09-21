/*
 * Quais conversas já tiveram gente escrevendo.
 *
 * A primeira versão disto varria a tabela de mensagens inteira, em páginas de
 * mil, para montar o selo "Com a SDR". A caixa de entrada recarrega a cada 15
 * segundos e o kanban carrega milhares de leads: numa instância pequena isso
 * vira carga constante em cima do banco, e foi o que ajudou a derrubar o
 * projeto.
 *
 * Agora a pergunta é feita só sobre as conversas que estão na tela, que são no
 * máximo trezentas, usando o índice de conversation_id. E o caso histórico —
 * conversa antiga com mensagem de SDR e assumed_at vazio — é resolvido de uma
 * vez pela migration 20260921120000_assumed_at_retroativo, não a cada leitura.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cliente = { from: (tabela: string) => any };

const REMETENTES_HUMANOS = ["sdr", "agent", "human"];
const LOTE = 150;

export async function conversasComHumano(db: Cliente, conversaIds: string[]): Promise<Set<string>> {
  const comHumano = new Set<string>();
  const alvos = [...new Set(conversaIds.filter(Boolean))];
  for (let i = 0; i < alvos.length; i += LOTE) {
    const fatia = alvos.slice(i, i + LOTE);
    const { data, error } = await db
      .from("whatsapp_messages")
      .select("conversation_id")
      .in("conversation_id", fatia)
      .in("sender_type", REMETENTES_HUMANOS)
      .limit(2000);
    if (error) break;
    for (const r of (data ?? []) as Array<{ conversation_id: string | null }>) {
      if (r.conversation_id) comHumano.add(r.conversation_id);
    }
  }
  return comHumano;
}
