/**
 * Faixas de vencimento dos créditos (data_renovacao, que a sinaleira grava a
 * partir de "Data Expiracao dos Creditos"), como em sinaleira.grougp.com:
 * Vencido, Vence em < 1 mês, 1 a 12 meses, > 1 ano e Sem data.
 */

export type FaixaVencimento =
  | "vencido"
  | "menos_1"
  | "m1"
  | "m2"
  | "m3"
  | "m4"
  | "m5"
  | "m6"
  | "m7"
  | "m8"
  | "m9"
  | "m10"
  | "m11"
  | "m12"
  | "mais_1_ano"
  | "sem_data";

export const FAIXAS_VENCIMENTO: { id: FaixaVencimento; rotulo: string }[] = [
  { id: "vencido", rotulo: "Vencido" },
  { id: "menos_1", rotulo: "Vence em < 1 mês" },
  ...Array.from({ length: 12 }, (_, i) => ({
    id: `m${i + 1}` as FaixaVencimento,
    rotulo: i === 0 ? "1 mês" : `${i + 1} meses`,
  })),
  { id: "mais_1_ano", rotulo: "> 1 ano" },
  { id: "sem_data", rotulo: "Sem data" },
];

const DIA = 86400000;
const MES_MEDIO = 30.4375;

export function faixaVencimento(
  vencimento: string | null | undefined,
  agora: Date = new Date(),
): FaixaVencimento {
  if (!vencimento) return "sem_data";
  const fim = new Date(`${vencimento.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(fim.getTime())) return "sem_data";
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const dias = Math.round((fim.getTime() - hoje.getTime()) / DIA);
  if (dias < 0) return "vencido";
  const meses = Math.floor(dias / MES_MEDIO);
  if (meses === 0) return "menos_1";
  if (meses > 12) return "mais_1_ano";
  return `m${meses}` as FaixaVencimento;
}
