import type { Lead } from "./lead-types";
import { evaluateIcpFit } from "./icp-fit";

export interface IcpRules {
  weights?: {
    b2b?: number;
    size?: number;
    segment?: number;
    position?: number;
    campaign?: number;
    intent?: number;
  };
  target_segments?: string[];
  target_sizes?: string[];
  target_positions?: string[];
  target_campaigns?: string[];
}

export interface IcpThresholds {
  high: number;
  medium: number;
  low: number;
}

export type Priority = "alta" | "media" | "baixa" | "fora_icp" | "pendente";

export interface ScoreResult {
  score: number;
  priority: Priority;
  signals: { key: string; label: string; matched: boolean }[];
}

/**
 * Scoring simplificado — 2 sinais binários (compartilhados com `evaluateIcpFit`):
 *  1. Cargo decisor (gerente/coordenador/supervisor/diretor/CEO/HRBP/BP/etc.)
 *  2. Empresa com 200+ funcionários
 *
 * Prioridade pela quantidade de sinais batidos:
 *  2/2 → alta · 1/2 → média · 0/2 → baixa.
 *
 * Os parâmetros `rules`/`thresholds` são aceitos por compatibilidade mas ignorados.
 */
export function calculateScore(
  lead: Partial<Lead>,
  _rules?: IcpRules,
  _thresholds?: IcpThresholds
): ScoreResult {
  const fit = evaluateIcpFit(lead as Lead);
  const signals: ScoreResult["signals"] = [
    { key: "position", label: "Cargo decisor", matched: fit.seniorPosition },
    { key: "size", label: "Empresa com mais de 200 funcionários", matched: fit.bigCompany },
  ];
  const matched = signals.filter((s) => s.matched).length;
  const score = matched === 2 ? 100 : matched === 1 ? 50 : 0;
  let priority: Priority;
  if (matched === 2) priority = "alta";
  else if (matched === 1) priority = "media";
  else priority = "baixa";
  return { score, priority, signals };
}