/*
 * De qual número sai a mensagem para o lead.
 *
 * Com a coexistência cada SDR tem o próprio número conectado. O lead que já é
 * dela recebe tudo dali — a primeira mensagem, os FUPs, as campanhas — para
 * conversar sempre com a mesma pessoa e, quando responder, cair no celular de
 * quem cuida dele.
 *
 * Só vale número espelhado, com WABA conhecido. Na coexistência cada número
 * fica no WABA que já era dele no app — não no da Grou —, e template mora no
 * WABA: quem dispara template confere, na hora, se ele está aprovado no WABA
 * desse número (templates-por-waba.server.ts).
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

export const wabaDe = (c: { metadata: unknown } | null) =>
  ((c?.metadata as { waba_id?: string } | null)?.waba_id ?? "").trim() || null;

export function escolherContaDaDona<C extends ContaCandidata>(
  contas: C[],
  donaId: string | null | undefined,
): C | null {
  if (!donaId) return null;
  const candidatas = contas.filter(
    (c) =>
      c.owner_user_id === donaId &&
      c.espelhada === true &&
      !c.is_default &&
      c.provider === "meta_cloud" &&
      STATUS_NO_AR.has(c.status ?? "") &&
      !!c.access_token &&
      !!c.provider_instance_id &&
      // Sem WABA não dá para conferir nem copiar template.
      !!wabaDe(c),
  );
  candidatas.sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
  return candidatas[0] ?? null;
}
