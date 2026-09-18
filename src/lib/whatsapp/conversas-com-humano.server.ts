/*
 * Quais conversas já tiveram gente escrevendo.
 *
 * Agora quem envia pelo inbox fica marcado como dono da conversa, mas isso só
 * vale daqui para frente: conversa antiga tem mensagem de SDR e assumed_at
 * vazio, e o selo dizia "IA atendendo" numa conversa que a pessoa já estava
 * tocando.
 *
 * Em vez de depender do backfill, a lista pergunta direto pelas mensagens. É
 * uma consulta de uma coluna só, filtrada por quem escreveu, e o resultado
 * cabe num Set.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cliente = { from: (tabela: string) => any };

const REMETENTES_HUMANOS = ["sdr", "agent", "human"];

export async function conversasComHumano(db: Cliente, limite = 20_000): Promise<Set<string>> {
  const ids = new Set<string>();
  const PAGINA = 1000;
  for (let de = 0; de < limite; de += PAGINA) {
    const { data, error } = await db
      .from("whatsapp_messages")
      .select("conversation_id")
      .in("sender_type", REMETENTES_HUMANOS)
      .order("conversation_id", { ascending: true })
      .range(de, de + PAGINA - 1);
    if (error || !data || data.length === 0) break;
    for (const r of data as Array<{ conversation_id: string | null }>) {
      if (r.conversation_id) ids.add(r.conversation_id);
    }
    if (data.length < PAGINA) break;
  }
  return ids;
}
