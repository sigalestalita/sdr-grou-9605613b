/*
 * Caixa de entrada privada.
 *
 * Por padrão a caixa é compartilhada: a conversa com responsável continua à
 * vista das outras pessoas, que é o que permite cobrir férias e passar lead
 * adiante. Para quem conduz negociação sensível isso não serve — transferir um
 * lead para essa pessoa tem que tirá-lo da vista de todo mundo, inclusive da
 * gestão.
 *
 * A lista fica em app_settings para não depender de migration e para a gestão
 * poder ligar e desligar na tela de Usuários.
 */

export const CAIXAS_PRIVADAS_KEY = "whatsapp_caixas_privadas";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cliente = { from: (tabela: string) => any };

/** Quem tem caixa privada hoje. */
export async function lerCaixasPrivadas(db: Cliente): Promise<string[]> {
  const { data } = await db
    .from("app_settings")
    .select("value")
    .eq("key", CAIXAS_PRIVADAS_KEY)
    .maybeSingle();
  const v = (data?.value ?? null) as { userIds?: unknown } | null;
  if (!v || !Array.isArray(v.userIds)) return [];
  return v.userIds.filter((id): id is string => typeof id === "string" && id.length > 0);
}

export async function salvarCaixasPrivadas(db: Cliente, userIds: string[]): Promise<void> {
  const unicos = [...new Set(userIds.filter((id) => typeof id === "string" && id.length > 0))];
  await db
    .from("app_settings")
    .upsert({ key: CAIXAS_PRIVADAS_KEY, value: { userIds: unicos } }, { onConflict: "key" });
}

export type ConversaVisivel = { assigned_user_id?: string | null };

/**
 * Tira da lista o que pertence a uma caixa privada de outra pessoa.
 *
 * Conversa sem responsável nunca é privada — fila geral é de todo mundo. E a
 * dona da caixa continua vendo as dela, obviamente.
 */
export function filtrarCaixasPrivadas<T extends ConversaVisivel>(
  conversas: T[],
  privadas: string[],
  quemOlha: string,
): T[] {
  if (privadas.length === 0) return conversas;
  const reservadas = new Set(privadas.filter((id) => id !== quemOlha));
  if (reservadas.size === 0) return conversas;
  return conversas.filter((c) => !c.assigned_user_id || !reservadas.has(c.assigned_user_id));
}
