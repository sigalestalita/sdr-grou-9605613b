/*
 * Nome que a caixa de entrada mostra para uma conversa.
 *
 * Conversa de lead usa o nome do lead. No número pessoal (coexistência) quem
 * escreve muitas vezes não é lead (cliente, colega, fornecedor): aí vale o nome
 * do contato do WhatsApp (o da agenda ou do perfil) e, sem ele, o número
 * formatado. "Sem nome" só quando não há nem número.
 */
export function telefoneLegivel(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\D+/g, "");
  if (!d) return null;
  const br = d.length >= 12 && d.startsWith("55") ? d.slice(2) : d;
  if (br.length === 11) return `(${br.slice(0, 2)}) ${br.slice(2, 7)}-${br.slice(7)}`;
  if (br.length === 10) return `(${br.slice(0, 2)}) ${br.slice(2, 6)}-${br.slice(6)}`;
  return `+${d}`;
}

export function nomeDaConversa(
  lead: { name?: string | null } | null | undefined,
  contato: { name?: string | null; phone?: string | null } | null | undefined,
): string {
  const limpo = (s: string | null | undefined) => (s ?? "").trim() || null;
  return limpo(lead?.name) ?? limpo(contato?.name) ?? telefoneLegivel(contato?.phone) ?? "Sem nome";
}
