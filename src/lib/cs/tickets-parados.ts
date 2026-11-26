/*
 * Ticket parado — parte pura. Um ticket em aberto (aberto, em andamento ou
 * aguardando cliente) que fica 72 horas sem movimento precisa de alguém olhar:
 * foi o pedido do time de CS ("o PDA não me retornou e eu esqueci").
 */
export const HORAS_PARADO = 72;
export const STATUS_EM_ABERTO = ["aberto", "em_andamento", "aguardando_cliente"] as const;

const HORA = 3600_000;

/** Dias parado (arredondado para baixo), ou null se não está parado. */
export function diasParado(
  t: { status: string; updatedAt: string },
  agora: Date = new Date(),
): number | null {
  if (!(STATUS_EM_ABERTO as readonly string[]).includes(t.status)) return null;
  const horas = (agora.getTime() - new Date(t.updatedAt).getTime()) / HORA;
  if (horas < HORAS_PARADO) return null;
  return Math.floor(horas / 24);
}

/** Avisa se está parado e se ainda não avisou desta parada. */
export function deveAvisar(
  t: { status: string; updatedAt: string; paradoAvisadoEm: string | null },
  agora: Date = new Date(),
): boolean {
  if (diasParado(t, agora) === null) return false;
  if (!t.paradoAvisadoEm) return true;
  // mexeu depois do último aviso e parou de novo
  return new Date(t.updatedAt).getTime() > new Date(t.paradoAvisadoEm).getTime();
}
