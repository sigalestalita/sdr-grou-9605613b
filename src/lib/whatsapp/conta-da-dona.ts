/*
 * De qual número sai a mensagem para o lead.
 *
 * Com a coexistência cada SDR tem o próprio número conectado. O lead que já é
 * dela recebe tudo dali — a primeira mensagem, os FUPs, as campanhas — para
 * conversar sempre com a mesma pessoa e, quando responder, cair no celular de
 * quem cuida dele.
 *
 * Só vale número espelhado, do mesmo WABA da conta padrão: os templates
 * aprovados moram no WABA, e template de um WABA não sai por número de outro
 * (a Meta recusa com "template não existe"). Número de outro portfólio fica de
 * fora e o envio segue pela conta padrão.
 */

export type ContaCandidata = {
  id: string;
  provider: string;
  status: string | null;
  owner_user_id: string | null;
  espelhada?: boolean | null;
  is_default?: boolean | null;
  access_token: string | null;
  provider_instance_id: string | null;
  metadata: unknown;
  updated_at?: string | null;
};

const STATUS_NO_AR = new Set(["active", "connected"]);

const wabaDe = (c: { metadata: unknown } | null) =>
  ((c?.metadata as { waba_id?: string } | null)?.waba_id ?? "").trim() || null;

export function escolherContaDaDona<C extends ContaCandidata>(
  contas: C[],
  donaId: string | null | undefined,
  padrao: ContaCandidata | null,
): C | null {
  if (!donaId) return null;
  const wabaPadrao = wabaDe(padrao);
  const candidatas = contas.filter(
    (c) =>
      c.owner_user_id === donaId &&
      c.espelhada === true &&
      !c.is_default &&
      c.provider === "meta_cloud" &&
      STATUS_NO_AR.has(c.status ?? "") &&
      !!c.access_token &&
      !!c.provider_instance_id &&
      // Sem WABA conhecido dos dois lados não dá para garantir o template.
      !!wabaPadrao &&
      wabaDe(c) === wabaPadrao,
  );
  candidatas.sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
  return candidatas[0] ?? null;
}
