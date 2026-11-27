/*
 * Oferta de horários ao cliente: regras puras (validar e ordenar os horários,
 * ver quais ainda podem ser escolhidos). O banco e a página ficam em
 * cs-reuniao-ofertas.functions.ts.
 */
export const MIN_HORARIOS = 2;
export const MAX_HORARIOS = 6;

/**
 * Valida e ordena os horários oferecidos. Recusa passado, repetidos e
 * sobrepostos (com a duração da reunião), porque o cliente não pode escolher
 * entre dois horários que na prática são o mesmo.
 */
export function validarHorarios(
  horarios: string[],
  duracaoMin: number,
  agora: Date = new Date(),
): { ok: true; horarios: string[] } | { ok: false; erro: string } {
  const lista = horarios
    .map((h) => h.trim())
    .filter(Boolean)
    .map((h) => new Date(h));
  if (lista.some((d) => Number.isNaN(d.getTime())))
    return { ok: false, erro: "Algum horário está inválido" };
  if (lista.length < MIN_HORARIOS)
    return { ok: false, erro: `Ofereça pelo menos ${MIN_HORARIOS} horários` };
  if (lista.length > MAX_HORARIOS) return { ok: false, erro: `No máximo ${MAX_HORARIOS} horários` };
  if (lista.some((d) => d.getTime() <= agora.getTime()))
    return { ok: false, erro: "Só dá para oferecer horários futuros" };
  const ordenados = [...lista].sort((a, b) => a.getTime() - b.getTime());
  const dur = Math.max(5, duracaoMin || 60) * 60_000;
  for (let i = 1; i < ordenados.length; i++) {
    if (ordenados[i].getTime() - ordenados[i - 1].getTime() < dur)
      return { ok: false, erro: "Dois horários se sobrepõem: afaste-os pela duração da reunião" };
  }
  return { ok: true, horarios: ordenados.map((d) => d.toISOString()) };
}

/** Horários que o cliente ainda pode escolher: os futuros, em ordem. */
export function horariosDisponiveis<T extends { inicio: string }>(
  horarios: T[],
  agora: Date = new Date(),
): T[] {
  return horarios
    .filter((h) => Date.parse(h.inicio) > agora.getTime())
    .sort((a, b) => a.inicio.localeCompare(b.inicio));
}
