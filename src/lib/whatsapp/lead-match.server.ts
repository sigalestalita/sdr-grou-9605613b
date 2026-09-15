import { phoneKey, sameNumber, ultimos4 } from "./phone";

/*
 * Achar o lead dono de um número, do jeito que os números realmente chegam.
 *
 * O caminho bom é a coluna phone_key, que o banco mantém normalizada. O
 * caminho de trás existe porque a migration pode ainda não ter rodado: aí
 * filtra pelos últimos 4 dígitos — que sobrevivem a qualquer máscara, porque
 * ficam depois do hífen — e decide no JS com a mesma regra.
 */

type Cliente = {
  from: (t: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select: (c: string) => any;
  };
};

export type LeadCasado = { id: string; phone: string | null; assigned_to?: string | null } | null;

export async function acharLeadPorTelefone(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Cliente | any,
  raw: string | null | undefined,
  colunas = "id, phone, assigned_to",
): Promise<LeadCasado> {
  const chave = phoneKey(raw);
  if (!chave) return null;

  const porChave = await db
    .from("leads")
    .select(colunas)
    .eq("phone_key", chave)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!porChave.error) return (porChave.data as LeadCasado) ?? null;

  // Sem a coluna ainda: filtra grosso no banco, decide fino aqui.
  const candidatos = await db
    .from("leads")
    .select(colunas)
    .ilike("phone", `%${ultimos4(raw)}%`)
    .order("created_at", { ascending: true })
    .limit(50);
  if (candidatos.error) return null;
  const hit = ((candidatos.data ?? []) as Array<{ phone: string | null }>).find((l) =>
    sameNumber(l.phone, raw),
  );
  return (hit as LeadCasado) ?? null;
}

/** O contato do WhatsApp daquele número, já normalizado na gravação. */
export async function acharContatoPorTelefone(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Cliente | any,
  raw: string | null | undefined,
) {
  const chave = phoneKey(raw);
  if (!chave) return null;

  const porChave = await db
    .from("whatsapp_contacts")
    .select("*")
    .eq("phone_key", chave)
    .limit(1)
    .maybeSingle();
  if (!porChave.error) return porChave.data ?? null;

  const candidatos = await db
    .from("whatsapp_contacts")
    .select("*")
    .ilike("phone", `%${ultimos4(raw)}%`)
    .limit(50);
  if (candidatos.error) return null;
  return (
    ((candidatos.data ?? []) as Array<{ phone: string | null }>).find((c) =>
      sameNumber(c.phone, raw),
    ) ?? null
  );
}
