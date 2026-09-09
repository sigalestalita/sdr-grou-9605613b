import type { CsSignal } from "@/lib/cs-types";

/**
 * Motor de cadência do Playbook CS — Sinaleira GROU v2.
 *
 * A cadência combina cinco variáveis: cor atual, semanas consecutivas na cor,
 * tendência das últimas 4 semanas, dias desde o último contato com resposta e
 * dias até a renovação. Lógica pura (sem I/O) para poder ser testada e usada
 * tanto no servidor quanto no cliente.
 */

export type CadenceTrend = "subindo" | "descendo" | "estavel" | "oscilando";

export const CADENCE_TREND_LABEL: Record<CadenceTrend, string> = {
  subindo: "Subindo",
  descendo: "Descendo",
  estavel: "Estável",
  oscilando: "Oscilando",
};

export type CadenceUrgency = "crise" | "estrategico" | "urgente" | "normal" | "baixa" | "nenhuma";

export const CADENCE_URGENCY_LABEL: Record<CadenceUrgency, string> = {
  crise: "Crise",
  estrategico: "Estratégico",
  urgente: "Urgente",
  normal: "Normal",
  baixa: "Baixa",
  nenhuma: "Observar",
};

/** Dias úteis sugeridos: 1 = segunda … 5 = sexta. */
export const CADENCE_WEEKDAYS = [1, 2, 3, 4, 5] as const;
export const WEEKDAY_LABEL: Record<number, string> = {
  1: "Segunda",
  2: "Terça",
  3: "Quarta",
  4: "Quinta",
  5: "Sexta",
};

export type CadenceSnapshot = {
  week_start: string;
  signal: CsSignal;
  consumo_pct?: number | null;
};

export type CadenceInput = {
  snapshots: CadenceSnapshot[]; // ordem crescente por week_start
  contractStart?: string | null;
  renewal?: string | null;
  lastContactAt?: string | null;
  /** Contatos com resposta registrados nos últimos 8 meses. */
  contactsWithResponse?: number;
  now?: Date;
};

export type CadencePlan = {
  color: CsSignal;
  weeksInColor: number;
  trend: CadenceTrend;
  consumoPct: number | null;
  inGrace: boolean;
  graceWeeks: number;
  /** null = apenas observar, sem contato ativo. */
  intervalDays: number | null;
  daysSinceContact: number | null;
  dueAt: string | null;
  overdueDays: number;
  due: boolean;
  urgency: CadenceUrgency;
  reason: string;
  action: string;
  suggestedWeekday: number;
  escalate: "executivo" | "diretoria" | null;
  daysToRenewal: number | null;
  contactsWithResponse: number;
  goalAtRisk: boolean;
};

const DAY = 86400000;
const RANK: Record<string, number> = { vermelho: 1, amarelo: 2, verde: 3 };

function diffDays(from: string | null | undefined, now: Date): number | null {
  if (!from) return null;
  const t = new Date(from).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((now.getTime() - t) / DAY);
}

/** Base da licença: início do contrato ou renovação − 12 meses. */
export function licenseStart(
  contractStart?: string | null,
  renewal?: string | null,
): string | null {
  if (contractStart) return contractStart;
  if (!renewal) return null;
  const d = new Date(renewal);
  if (Number.isNaN(d.getTime())) return null;
  d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

/** Tendência a partir das últimas 4 semanas do histórico de sinaleira. */
export function computeTrend(history: CsSignal[]): CadenceTrend {
  const h = history.filter((s) => s !== "sem_dado" && s !== "preto").slice(-4);
  if (h.length < 2) return "estavel";
  const distinct = new Set(h);
  if (distinct.size === 1) return "estavel";
  const first = RANK[h[0]] ?? 0;
  const last = RANK[h[h.length - 1]] ?? 0;
  // Estável quando a cor atual se repete há 3+ semanas, mesmo com mudança antiga.
  let streak = 1;
  for (let i = h.length - 2; i >= 0; i--) {
    if (h[i] === h[h.length - 1]) streak++;
    else break;
  }
  if (streak >= 3) return "estavel";
  if (last > first) return "subindo";
  if (last < first) return "descendo";
  return "oscilando";
}

export function weeksInColor(history: CsSignal[]): { color: CsSignal; weeks: number } {
  const h = history.filter((s) => s !== "sem_dado");
  if (h.length === 0) return { color: "sem_dado", weeks: 0 };
  const color = h[h.length - 1];
  let weeks = 1;
  for (let i = h.length - 2; i >= 0; i--) {
    if (h[i] === color) weeks++;
    else break;
  }
  return { color, weeks };
}

type Rule = {
  intervalDays: number | null;
  urgency: CadenceUrgency;
  reason: string;
  action: string;
  escalate?: "executivo" | "diretoria" | null;
};

function redRule(weeks: number, trend: CadenceTrend): Rule {
  if (trend === "descendo")
    return {
      intervalDays: 3,
      urgency: "urgente",
      reason: "Caiu de amarelo para vermelho nas últimas semanas — queda rápida.",
      action: "Contato investigativo em 3 dias úteis: o que aconteceu no período?",
    };
  if (trend === "subindo")
    return {
      intervalDays: 21,
      urgency: "normal",
      reason: "Vermelho, mas em recuperação (subiu para amarelo nos últimos 30 dias).",
      action: "Acompanhamento positivo a cada 21 dias — reforçar o que está funcionando.",
    };
  if (trend === "oscilando")
    return {
      intervalDays: 14,
      urgency: "urgente",
      reason: "Alternando entre vermelho e amarelo — cliente instável.",
      action:
        "Contato a cada 14 dias para mapear o padrão (projeto sazonal? processo específico?).",
    };
  if (weeks >= 24)
    return {
      intervalDays: 30,
      urgency: "estrategico",
      reason: `${weeks} semanas consecutivas em vermelho (6+ meses).`,
      action: "Entra na lista consolidada de revisão estratégica com diretoria e admin.",
      escalate: "diretoria",
    };
  if (weeks > 8)
    return {
      intervalDays: 30,
      urgency: "crise",
      reason: `${weeks} semanas consecutivas em vermelho (2+ meses).`,
      action: "Contato mensal com Executivo envolvido — plano de recuperação conjunto.",
      escalate: "executivo",
    };
  if (weeks >= 5)
    return {
      intervalDays: 21,
      urgency: "urgente",
      reason: `${weeks}ª semana em vermelho.`,
      action: "Acompanhamento a cada 21 dias — revisão de uso e percepção de valor.",
    };
  if (weeks >= 3)
    return {
      intervalDays: 14,
      urgency: "urgente",
      reason: `${weeks}ª semana em vermelho.`,
      action: "Contato a cada 14 dias com plano de ação concreto + Executivo.",
    };
  if (weeks === 2)
    return {
      intervalDays: 7,
      urgency: "urgente",
      reason: "2ª semana consecutiva em vermelho.",
      action: "Plano de ação 7 dias após o primeiro contato — envolver Executivo.",
      escalate: "executivo",
    };
  return {
    intervalDays: 5,
    urgency: "urgente",
    reason: "1ª semana em vermelho.",
    action: "Contato de diagnóstico em até 5 dias úteis — as 5 perguntas do vermelho.",
  };
}

function yellowRule(weeks: number, trend: CadenceTrend): Rule {
  if (trend === "descendo")
    return {
      intervalDays: 14,
      urgency: "urgente",
      reason: "Desceu do verde para o amarelo — sinal de desaceleração.",
      action: "Contato já na 2ª semana amarela: algum projeto pausou?",
    };
  if (trend === "subindo")
    return {
      intervalDays: 30,
      urgency: "normal",
      reason: "Subiu do vermelho para o amarelo — cliente em recuperação.",
      action: "Contato a cada 30 dias com tom de reforço: o que reativou o uso?",
    };
  if (trend === "oscilando")
    return {
      intervalDays: 45,
      urgency: "baixa",
      reason: "Alternando entre amarelo e verde — provável sazonalidade saudável.",
      action: "Contato a cada 45 dias para confirmar e documentar o padrão sazonal.",
    };
  if (weeks > 8)
    return {
      intervalDays: 30,
      urgency: "normal",
      reason: `${weeks} semanas em amarelo (2+ meses).`,
      action: "Contato mensal com revisão de uso mais profunda — sazonal ou estrutural?",
    };
  if (weeks >= 4)
    return {
      intervalDays: 30,
      urgency: "normal",
      reason: `${weeks}ª semana em amarelo.`,
      action: "Contato a cada 30 dias com proposta concreta (Masterclass, agenda técnica).",
    };
  if (weeks === 3)
    return {
      intervalDays: 21,
      urgency: "normal",
      reason: "3ª semana consecutiva em amarelo.",
      action: "Primeiro contato: investigar causa e propor próximo passo.",
    };
  return {
    intervalDays: null,
    urgency: "nenhuma",
    reason: `${weeks}ª semana em amarelo — sem contato ativo, apenas observar.`,
    action: "Observar a próxima leitura da sinaleira.",
  };
}

function greenRule(weeks: number, trend: CadenceTrend, consumo: number | null): Rule {
  if (consumo !== null && consumo >= 140)
    return {
      intervalDays: 0,
      urgency: "urgente",
      reason: `Consumo ${Math.round(consumo)}% da projeção (≥ 40% acima).`,
      action: "Contato imediato e acionar Executivo — janela de expansão aberta.",
      escalate: "executivo",
    };
  if (trend === "oscilando")
    return {
      intervalDays: 45,
      urgency: "baixa",
      reason: "Alternando verde e amarelo sem cair em vermelho — padrão sazonal positivo.",
      action: "Contato a cada 45 dias — documentar o padrão para usar na renovação.",
    };
  if (weeks > 8)
    return {
      intervalDays: 60,
      urgency: "baixa",
      reason: `${weeks} semanas em verde — cliente consolidado.`,
      action: "Contato a cada 60 dias, tom estratégico sobre o próximo ciclo.",
    };
  if (weeks >= 4)
    return {
      intervalDays: 45,
      urgency: "normal",
      reason: `${weeks}ª semana em verde.`,
      action: "Contato a cada 45 dias — aprofundar caso de uso e criar gancho de expansão.",
    };
  if (weeks === 3)
    return {
      intervalDays: 21,
      urgency: "normal",
      reason:
        trend === "subindo"
          ? "3ª semana verde após subida do amarelo."
          : "3ª semana verde consecutiva.",
      action: "Check-in de sucesso: o que está puxando o crescimento de uso?",
    };
  return {
    intervalDays: null,
    urgency: "nenhuma",
    reason: `${weeks}ª semana em verde — confirmar que não é pico pontual.`,
    action: "Observar a próxima leitura da sinaleira.",
  };
}

function weekdayFor(urgency: CadenceUrgency, color: CsSignal, due: boolean): number {
  if (!due) return 5;
  if (urgency === "crise" || urgency === "estrategico") return 1;
  if (color === "vermelho") return urgency === "urgente" ? 2 : 3;
  if (color === "amarelo") return 3;
  if (color === "verde") return 4;
  return 5;
}

/** Aplica as tabelas de intervalo dos Blocos 2, 3 e 4 do playbook. */
export function computeCadence(input: CadenceInput): CadencePlan {
  const now = input.now ?? new Date();
  const history = input.snapshots.map((s) => s.signal);
  const { color, weeks } = weeksInColor(history);
  const trend = computeTrend(history);
  const consumoPct = (() => {
    for (let i = input.snapshots.length - 1; i >= 0; i--) {
      const v = input.snapshots[i]?.consumo_pct;
      if (v !== null && v !== undefined) return Number(v);
    }
    return null;
  })();

  const start = licenseStart(input.contractStart, input.renewal);
  const licenseDays = diffDays(start, now);
  const graceWeeks = licenseDays === null ? 0 : Math.max(0, Math.ceil((60 - licenseDays) / 7));
  const inGrace = licenseDays !== null && licenseDays < 60;

  const daysToRenewal = input.renewal
    ? Math.ceil((new Date(input.renewal).getTime() - now.getTime()) / DAY)
    : null;
  const daysSinceContact = diffDays(input.lastContactAt, now);
  const contactsWithResponse = input.contactsWithResponse ?? 0;

  let rule: Rule;
  if (color === "vermelho") rule = redRule(weeks, trend);
  else if (color === "amarelo") rule = yellowRule(weeks, trend);
  else if (color === "verde") rule = greenRule(weeks, trend, consumoPct);
  else if (color === "preto")
    rule = {
      intervalDays: null,
      urgency: "nenhuma",
      reason: "Licença vencida / conta inativa — fora da cadência de sinaleira.",
      action: "Fila de reativação: tratar como recompra com o Executivo, não como uso baixo.",
    };
  else
    rule = {
      intervalDays: null,
      urgency: "nenhuma",
      reason: "Sem leitura de sinaleira nas últimas semanas.",
      action: "Verificar sincronização da sinaleira antes de agir.",
    };

  // Renovação ≤ 60 dias com cliente fora do verde exige contato imediato.
  if (
    daysToRenewal !== null &&
    daysToRenewal <= 60 &&
    daysToRenewal >= 0 &&
    color !== "verde" &&
    color !== "preto"
  ) {
    rule = {
      intervalDays: 0,
      urgency: color === "vermelho" ? "crise" : "urgente",
      reason: `Renovação em ${daysToRenewal} dias com sinaleira ${color}.`,
      action:
        color === "vermelho"
          ? "Modo crise: conversa de CS + Executivo antes de abrir a renovação."
          : "Contato imediato independente do histórico — preparar renovação.",
      escalate: color === "vermelho" ? "executivo" : (rule.escalate ?? null),
    };
  }

  if (inGrace) {
    return {
      color,
      weeksInColor: weeks,
      trend,
      consumoPct,
      inGrace: true,
      graceWeeks,
      intervalDays: null,
      daysSinceContact,
      dueAt: null,
      overdueDays: 0,
      due: false,
      urgency: "nenhuma",
      reason: `Carência de 60 dias — ${licenseDays ?? 0} dias de licença. Gatilhos começam na 9ª semana.`,
      action: "Conduzir onboarding e treinamento; sem gatilho de sinaleira ainda.",
      suggestedWeekday: 5,
      escalate: null,
      daysToRenewal,
      contactsWithResponse,
      goalAtRisk: false,
    };
  }

  const interval = rule.intervalDays;
  let dueAt: string | null = null;
  let overdueDays = 0;
  let due = false;
  if (interval !== null) {
    if (!input.lastContactAt) {
      due = true;
      dueAt = new Date(now).toISOString();
      overdueDays = interval;
    } else {
      const dueTime = new Date(input.lastContactAt).getTime() + interval * DAY;
      dueAt = new Date(dueTime).toISOString();
      overdueDays = Math.floor((now.getTime() - dueTime) / DAY);
      due = overdueDays >= 0;
    }
  }

  // Meta de 4 contatos com resposta dentro de uma janela de 8 meses.
  const goalAtRisk =
    contactsWithResponse < 4 &&
    ((daysToRenewal !== null && daysToRenewal <= 120) ||
      (licenseDays !== null && licenseDays >= 180));

  return {
    color,
    weeksInColor: weeks,
    trend,
    consumoPct,
    inGrace: false,
    graceWeeks: 0,
    intervalDays: interval,
    daysSinceContact,
    dueAt,
    overdueDays,
    due,
    urgency: rule.urgency,
    reason: rule.reason,
    action: rule.action,
    suggestedWeekday: weekdayFor(rule.urgency, color, due),
    escalate: rule.escalate ?? null,
    daysToRenewal,
    contactsWithResponse,
    goalAtRisk,
  };
}

export const URGENCY_ORDER: CadenceUrgency[] = [
  "crise",
  "estrategico",
  "urgente",
  "normal",
  "baixa",
  "nenhuma",
];

export const URGENCY_TONE: Record<CadenceUrgency, string> = {
  crise: "border-red-500/50 bg-red-500/10 text-red-500",
  estrategico: "border-purple-500/50 bg-purple-500/10 text-purple-500",
  urgente: "border-amber-500/50 bg-amber-500/10 text-amber-500",
  normal: "border-sky-500/50 bg-sky-500/10 text-sky-500",
  baixa: "border-emerald-500/50 bg-emerald-500/10 text-emerald-500",
  nenhuma: "border-border bg-muted text-muted-foreground",
};
