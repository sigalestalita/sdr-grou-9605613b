/*
 * Datas no fuso de Brasília. O banco guarda timestamptz (UTC): uma venda
 * registrada em 31/10 às 22h é 01/11 01h em UTC e, sem isso, cairia na meta,
 * na comissão e no relatório de novembro. O Brasil não tem horário de verão
 * desde 2019, então o deslocamento é fixo em −03:00.
 */
export const FUSO_SP = "-03:00";
const DESLOCAMENTO_MS = 3 * 60 * 60 * 1000;

/** "YYYY-MM-DD" do instante, no calendário de Brasília. */
export function dataSP(instante: string | Date): string {
  const t = typeof instante === "string" ? Date.parse(instante) : instante.getTime();
  return new Date(t - DESLOCAMENTO_MS).toISOString().slice(0, 10);
}

/** Hoje em Brasília. */
export function hojeSP(agora = new Date()): string {
  return dataSP(agora);
}

/** Meia-noite de Brasília do dia, para filtrar timestamptz ("2026-10-01T00:00:00-03:00"). */
export function inicioDoDiaSP(dia: string): string {
  return `${dia.slice(0, 10)}T00:00:00${FUSO_SP}`;
}
