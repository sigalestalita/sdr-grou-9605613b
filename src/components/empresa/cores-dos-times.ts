import { TIMES, type Time } from "@/lib/empresa/resumo-por-time";

/** Cor de cada time no resumo da conta e nos alertas do Início. */
export const COR_DO_TIME: Record<Time, { ponto: string; chip: string }> = {
  sdr: { ponto: "bg-sky-500", chip: "border-sky-500/40 text-sky-700 dark:text-sky-300" },
  comercial: {
    ponto: "bg-indigo-500",
    chip: "border-indigo-500/40 text-indigo-700 dark:text-indigo-300",
  },
  cs: {
    ponto: "bg-emerald-500",
    chip: "border-emerald-500/40 text-emerald-700 dark:text-emerald-300",
  },
  adm: { ponto: "bg-amber-500", chip: "border-amber-500/40 text-amber-700 dark:text-amber-300" },
  trainers: {
    ponto: "bg-fuchsia-500",
    chip: "border-fuchsia-500/40 text-fuchsia-700 dark:text-fuchsia-300",
  },
};
export const NOME_DO_TIME = Object.fromEntries(TIMES.map((t) => [t.id, t.nome])) as Record<
  Time,
  string
>;
