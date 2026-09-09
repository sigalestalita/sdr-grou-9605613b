import type { Database } from "@/integrations/supabase/types";

export type CsClient = Database["public"]["Tables"]["cs_clients"]["Row"];
export type CsContact = Database["public"]["Tables"]["cs_contacts"]["Row"];
export type CsTag = Database["public"]["Tables"]["cs_client_tags"]["Row"];
export type CsSnapshot = Database["public"]["Tables"]["cs_signal_snapshots"]["Row"];
export type CsRecord = Database["public"]["Tables"]["cs_records"]["Row"];
export type CsTimelineEvent = Database["public"]["Tables"]["cs_timeline_events"]["Row"];
export type CsAlert = Database["public"]["Tables"]["cs_alerts"]["Row"];

export const CS_STAGES = ["onboarding", "ativacao", "renovacao"] as const;
export type CsStage = (typeof CS_STAGES)[number];

export const CS_STAGE_LABEL: Record<CsStage, string> = {
  onboarding: "Onboarding (0–2 meses)",
  ativacao: "Ativação/Adoção (2–10 meses)",
  renovacao: "Renovação (10–12 meses)",
};

export const CS_SIGNALS = ["verde", "amarelo", "vermelho", "preto", "sem_dado"] as const;
export type CsSignal = (typeof CS_SIGNALS)[number];

export const CS_SIGNAL_LABEL: Record<string, string> = {
  verde: "Verde",
  amarelo: "Amarelo",
  vermelho: "Vermelho",
  preto: "Preto (vencido)",
  sem_dado: "Sem dado",
};

/** Cores da barrinha semanal (tokens semânticos evitados aqui de propósito: sinaleira é literal). */
export const CS_SIGNAL_CLASS: Record<string, string> = {
  verde: "bg-emerald-500",
  amarelo: "bg-amber-400",
  vermelho: "bg-red-500",
  preto: "bg-zinc-700",
  sem_dado: "bg-muted",
};

export const CS_SIGNAL_POINTS: Record<string, number> = {
  verde: 1,
  amarelo: 0.5,
  vermelho: 0,
  preto: 0,
  sem_dado: 0,
};

export const CS_ORIGINS = ["marketing", "indicacao", "outbound", "renovacao"] as const;
export const CS_ORIGIN_LABEL: Record<string, string> = {
  marketing: "Marketing",
  indicacao: "Indicação",
  outbound: "Outbound",
  renovacao: "Renovação",
};

export const CS_CLIENT_TYPES = ["empresa", "consultoria", "pessoa_fisica"] as const;
export const CS_CLIENT_TYPE_LABEL: Record<string, string> = {
  empresa: "Empresa",
  consultoria: "Consultoria",
  pessoa_fisica: "Pessoa física",
};

/** Serviço principal contratado. Sem licença PDA não há sinaleira. */
export const CS_SERVICE_TYPES = [
  "licenca_pda",
  "certificacao",
  "dg",
  "avulso",
  "consultoria",
] as const;
export type CsServiceType = (typeof CS_SERVICE_TYPES)[number];
export const CS_SERVICE_TYPE_LABEL: Record<string, string> = {
  licenca_pda: "Licença PDA",
  certificacao: "Certificação",
  dg: "Diagnóstico de gestão (DG)",
  avulso: "Compra avulsa",
  consultoria: "Consultoria",
};

/** Playbook v2: para que o cliente usa o PDA. */
export const CS_TAG_USO = ["recrutamento", "desenvolvimento", "ambos"] as const;
export const CS_TAG_USO_LABEL: Record<string, string> = {
  recrutamento: "Recrutamento",
  desenvolvimento: "Desenvolvimento",
  ambos: "Recrutamento e desenvolvimento",
};

export const CS_CONTACT_MODULES = [
  "marketing",
  "cs",
  "comercial",
  "adm_financeiro",
  "nao_marketing",
] as const;
export const CS_CONTACT_MODULE_LABEL: Record<string, string> = {
  marketing: "Marketing",
  cs: "CS",
  comercial: "Comercial",
  adm_financeiro: "ADM/Financeiro",
  nao_marketing: "Não marketing",
};

export const CS_CONTACT_ORIGINS = ["manual", "email_bcc", "pda_api", "linkedin"] as const;
export const CS_CONTACT_ORIGIN_LABEL: Record<string, string> = {
  manual: "Manual",
  email_bcc: "E-mail (BCC)",
  pda_api: "API PDA",
  linkedin: "LinkedIn",
};

export const CS_AGENDA_TYPES = [
  "construcao_cargo",
  "pdi",
  "ppa",
  "ninebox",
  "cross_sell",
  "renovacao",
  "alinhamento_estrategico",
  "masterclass",
] as const;
export type CsAgendaType = (typeof CS_AGENDA_TYPES)[number];

export const CS_AGENDA_TYPE_LABEL: Record<string, string> = {
  construcao_cargo: "Construção de Cargo",
  pdi: "PDI",
  ppa: "PPA",
  ninebox: "Ninebox",
  cross_sell: "Cross-sell",
  renovacao: "Renovação",
  alinhamento_estrategico: "Alinhamento Estratégico",
  masterclass: "Masterclass",
};

/** Toda agenda gera uma tag acumulativa na EMPRESA. */
export const CS_AGENDA_TAG: Record<string, string> = {
  construcao_cargo: "construcao_cargo",
  pdi: "pdi",
  ppa: "ppa",
  ninebox: "ninebox",
  cross_sell: "cross_sell",
  renovacao: "renovacao",
  alinhamento_estrategico: "alinhamento_estrategico",
  masterclass: "masterclass_realizada",
};

export const CS_CONTACT_TYPES = ["whatsapp", "email", "agenda", "ligacao"] as const;
export const CS_CONTACT_TYPE_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  email: "E-mail",
  agenda: "Agenda",
  ligacao: "Ligação",
};

export const CS_ALERT_TYPES = [
  "sinaleira_critica",
  "queda_sinaleira",
  "sla_estourado",
  "sem_contato",
  "oportunidade_upsell",
  "licenca_vencida",
] as const;
export const CS_ALERT_TYPE_LABEL: Record<string, string> = {
  sinaleira_critica: "Sinaleira crítica",
  queda_sinaleira: "Queda de sinaleira",
  sla_estourado: "SLA estourado",
  sem_contato: "Cliente sem contato",
  oportunidade_upsell: "Oportunidade de upsell",
  licenca_vencida: "Licença vencida — reativação",
};

export type HealthWeights = {
  sinaleira: number;
  agenda: number;
  whatsapp: number;
  proposta_aberta: number;
  masterclass: number;
  analista_pda: number;
};

/** Fórmula da Marcela: 40 sinaleira · 10 agenda · 10 WhatsApp · 10 proposta · 10 masterclass · 10 analista. */
export const DEFAULT_HEALTH_WEIGHTS: HealthWeights = {
  sinaleira: 40,
  agenda: 10,
  whatsapp: 10,
  proposta_aberta: 10,
  masterclass: 10,
  analista_pda: 10,
};

/** Pontos absolutos por cor dentro do peso da sinaleira (verde 40 · amarelo 20 · vermelho 0). */
export type HealthSignalPoints = { verde: number; amarelo: number; vermelho: number };
export const DEFAULT_HEALTH_SIGNAL_POINTS: HealthSignalPoints = {
  verde: 40,
  amarelo: 20,
  vermelho: 0,
};

export type HealthOptions = {
  /** Cliente sem sinaleira (certificação, DG, avulso, preto) é pontuado sobre os critérios aplicáveis. */
  renormalizar_sem_sinaleira: boolean;
};
export const DEFAULT_HEALTH_OPTIONS: HealthOptions = { renormalizar_sem_sinaleira: true };

export type DailyTarget = { contatos_por_dia: number };
export const DEFAULT_DAILY_TARGET: DailyTarget = { contatos_por_dia: 5 };

export type StageSla = {
  onboarding: number;
  ativacao: number;
  renovacao: number;
  sem_contato_dias: number;
};

export const DEFAULT_STAGE_SLA: StageSla = {
  onboarding: 60,
  ativacao: 240,
  renovacao: 60,
  sem_contato_dias: 45,
};

export type RoutingConfig = {
  aporte_threshold: number;
  consultoria_cs: string | null;
  cs_round_robin: string[];
  comercial_high: string[];
  renovacao_cs: string | null;
  rr_cursor: number;
};

export const DEFAULT_ROUTING: RoutingConfig = {
  aporte_threshold: 500,
  consultoria_cs: null,
  cs_round_robin: [],
  comercial_high: [],
  renovacao_cs: null,
  rr_cursor: 0,
};

export type HealthInput = {
  signal: CsSignal;
  /** false = cliente sem licença PDA ou sinaleira preta/sem dado: critério não se aplica. */
  hasSinaleira: boolean;
  agendaLast90d: number;
  whatsappAnswered: boolean;
  propostaAberta: boolean;
  masterclass: boolean;
  analistaPda: boolean;
};

export type HealthBreakdown = {
  key: keyof HealthWeights;
  label: string;
  points: number;
  max: number;
  applies: boolean;
};

export const HEALTH_CRITERIA_LABEL: Record<keyof HealthWeights, string> = {
  sinaleira: "Sinaleira PDA",
  agenda: "Agenda realizada (90 d)",
  whatsapp: "WhatsApp respondido",
  proposta_aberta: "Proposta em aberto",
  masterclass: "Masterclass realizada",
  analista_pda: "Analista PDA certificado",
};

/**
 * Health score 0–100. Engajamento, não resultado. A sinaleira contribui com
 * pontos absolutos por cor; os demais critérios são binários (agenda: até 2
 * em 90 dias). Quando a sinaleira não se aplica e a renormalização está
 * ligada, o score é calculado sobre os critérios restantes.
 */
export function computeHealthBreakdown(
  input: HealthInput,
  weights: HealthWeights,
  points: HealthSignalPoints = DEFAULT_HEALTH_SIGNAL_POINTS,
  options: HealthOptions = DEFAULT_HEALTH_OPTIONS,
): { score: number; breakdown: HealthBreakdown[] } {
  const sinaleiraApplies =
    input.hasSinaleira && input.signal !== "preto" && input.signal !== "sem_dado";
  const signalPts = sinaleiraApplies
    ? Math.min(weights.sinaleira, points[input.signal as keyof HealthSignalPoints] ?? 0)
    : 0;
  const breakdown: HealthBreakdown[] = [
    {
      key: "sinaleira",
      label: HEALTH_CRITERIA_LABEL.sinaleira,
      points: signalPts,
      max: weights.sinaleira,
      applies: sinaleiraApplies || !options.renormalizar_sem_sinaleira,
    },
    {
      key: "agenda",
      label: HEALTH_CRITERIA_LABEL.agenda,
      points: Math.min(1, input.agendaLast90d / 2) * weights.agenda,
      max: weights.agenda,
      applies: true,
    },
    {
      key: "whatsapp",
      label: HEALTH_CRITERIA_LABEL.whatsapp,
      points: (input.whatsappAnswered ? 1 : 0) * weights.whatsapp,
      max: weights.whatsapp,
      applies: true,
    },
    {
      key: "proposta_aberta",
      label: HEALTH_CRITERIA_LABEL.proposta_aberta,
      points: (input.propostaAberta ? 1 : 0) * weights.proposta_aberta,
      max: weights.proposta_aberta,
      applies: true,
    },
    {
      key: "masterclass",
      label: HEALTH_CRITERIA_LABEL.masterclass,
      points: (input.masterclass ? 1 : 0) * weights.masterclass,
      max: weights.masterclass,
      applies: true,
    },
    {
      key: "analista_pda",
      label: HEALTH_CRITERIA_LABEL.analista_pda,
      points: (input.analistaPda ? 1 : 0) * weights.analista_pda,
      max: weights.analista_pda,
      applies: true,
    },
  ];
  const total = breakdown.filter((b) => b.applies).reduce((a, b) => a + b.max, 0);
  const raw = breakdown.filter((b) => b.applies).reduce((a, b) => a + b.points, 0);
  return { score: total > 0 ? Math.round((raw / total) * 100) : 0, breakdown };
}

export function computeHealthScore(
  input: HealthInput,
  weights: HealthWeights,
  points?: HealthSignalPoints,
  options?: HealthOptions,
): number {
  return computeHealthBreakdown(input, weights, points, options).score;
}

export type SignalTrend =
  | { kind: "critico"; weeks: number }
  | { kind: "queda" }
  | { kind: "oportunidade"; weeks: number }
  | { kind: "estavel" };

/** history = mais antigo -> mais recente (até 8 semanas). */
export function analyzeSignalTrend(history: CsSignal[]): SignalTrend {
  const h = history.filter((s) => s !== "sem_dado" && s !== "preto");
  if (h.length === 0) return { kind: "estavel" };
  let streak = 1;
  const last = h[h.length - 1];
  for (let i = h.length - 2; i >= 0; i--) {
    if (h[i] === last) streak++;
    else break;
  }
  if (last === "vermelho" && streak >= 5) return { kind: "critico", weeks: streak };
  if (last === "verde" && streak >= 5) return { kind: "oportunidade", weeks: streak };
  if (last === "vermelho" && h.length >= 2 && h[h.length - 2] === "verde") return { kind: "queda" };
  return { kind: "estavel" };
}

export function healthLabel(score: number): { label: string; cls: string } {
  if (score >= 70) return { label: "Saudável", cls: "text-emerald-600" };
  if (score >= 40) return { label: "Atenção", cls: "text-amber-600" };
  return { label: "Risco", cls: "text-red-600" };
}

export function daysBetween(from: string | null | undefined, to = new Date()): number | null {
  if (!from) return null;
  return Math.floor((to.getTime() - new Date(from).getTime()) / 86400000);
}

export function mondayOf(date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dow = d.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function lastNWeeks(n: number, from = new Date()): string[] {
  const base = mondayOf(from);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(`${base}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i * 7);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
