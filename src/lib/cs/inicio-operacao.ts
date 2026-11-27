/*
 * Dia 1 do CS (cs_settings.inicio_operacao = { data: "aaaa-mm-dd" }).
 *
 * Nada que venceu antes do início da operação conta como atrasado, e os
 * prazos (SLA da etapa, dias sem contato, cadência) contam a partir dele.
 * O histórico real (último contato, entrada na etapa) não muda: só a âncora
 * dos prazos.
 */
export const CHAVE_INICIO_OPERACAO = "inicio_operacao";

/** "aaaa-mm-dd" válido guardado nas configurações, ou null. */
export function lerInicioOperacao(v: unknown): string | null {
  const data = (v as { data?: unknown } | null)?.data;
  return typeof data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : null;
}

/** Meia-noite (Brasília) do dia de início, em ISO. */
export function inicioIso(data: string | null): string | null {
  return data ? `${data}T03:00:00.000Z` : null;
}

/** A data mais recente entre a real e o início; sem data real, o início. */
export function ancorar(iso: string | null | undefined, inicio: string | null): string | null {
  if (!inicio) return iso ?? null;
  if (!iso) return inicio;
  return new Date(iso).getTime() >= new Date(inicio).getTime() ? iso : inicio;
}

/** Venceu antes do início da operação: fica fora dos atrasados. */
export function antesDoInicio(iso: string, inicio: string | null): boolean {
  return !!inicio && new Date(iso).getTime() < new Date(inicio).getTime();
}
