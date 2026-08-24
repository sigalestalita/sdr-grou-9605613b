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

export const CS_SIGNALS = ["verde", "amarelo", "vermelho", "sem_dado"] as const;
export type CsSignal = (typeof CS_SIGNALS)[number];

export const CS_SIGNAL_LABEL: Record<string, string> = {
  verde: "Verde",
  amarelo: "Amarelo",
  vermelho: "Vermelho",
  sem_dado: "Sem dado",
};

/** Cores da barrinha semanal (tokens semânticos evitados aqui de propósito: sinaleira é literal). */
export const CS_SIGNAL_CLASS: Record<string, string> = {
  verde: "bg-emerald-500",
  amarelo: "bg-amber-400",
  vermelho: "bg-red-500",
  sem_dado: "bg-muted",
};

export const CS_SIGNAL_POINTS: Record<string, number> = {
  verde: 1,
  amarelo: 0.5,
  vermelho: 0,
  sem_dado: 0,
};

export const CS_ORIGINS = ["marketing", "indicacao", "outbound", "renovacao"] as const;
export const CS_ORIGIN_LABEL: Record<string, string> = {
  marketing: "Marketing",
  indicacao: "Indicação",
  outbound: "Outbound",
  renovacao: "Renovação",
};

export const CS_CLIENT_TYPES = ["empresa", "consultoria"] as const;
export const CS_CLIENT_TYPE_LABEL: Record<string, string> = {
  empresa: "Empresa",
  consultoria: "Consultoria",
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
] as const;
export const CS_ALERT_TYPE_LABEL: Record<string, string> = {
  sinaleira_critica: "Sinaleira crítica",
  queda_sinaleira: "Queda de sinaleira",
  sla_estourado: "SLA estourado",
  sem_contato: "Cliente sem contato",
  oportunidade_upsell: "Oportunidade de upsell",
};

export type HealthWeights = {
  sinaleira_pda: number;
  agenda_90d: number;
  whatsapp_respondido: number;
  email_respondido: number;
  uso_plataforma_cs: number;
};

export const DEFAULT_HEALTH_WEIGHTS: HealthWeights = {
  sinaleira_pda: 50,
  agenda_90d: 25,
  whatsapp_respondido: 10,
  email_respondido: 5,
  uso_plataforma_cs: 10,
};

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
  agendaLast90d: number;
  whatsappAnswered: boolean;
  emailAnswered: boolean;
  csPlatformUse: boolean;
};

/** Health score 0–100 com pesos configuráveis. Engajamento, não resultado. */
export function computeHealthScore(input: HealthInput, weights: HealthWeights): number {
  const total =
    weights.sinaleira_pda +
    weights.agenda_90d +
    weights.whatsapp_respondido +
    weights.email_respondido +
    weights.uso_plataforma_cs;
  if (total <= 0) return 0;
  const signalPts = (CS_SIGNAL_POINTS[input.signal] ?? 0) * weights.sinaleira_pda;
  const agendaPts = Math.min(1, input.agendaLast90d / 2) * weights.agenda_90d;
  const waPts = (input.whatsappAnswered ? 1 : 0) * weights.whatsapp_respondido;
  const mailPts = (input.emailAnswered ? 1 : 0) * weights.email_respondido;
  const csPts = (input.csPlatformUse ? 1 : 0) * weights.uso_plataforma_cs;
  const raw = signalPts + agendaPts + waPts + mailPts + csPts;
  return Math.round((raw / total) * 100);
}

export type SignalTrend =
  | { kind: "critico"; weeks: number }
  | { kind: "queda" }
  | { kind: "oportunidade"; weeks: number }
  | { kind: "estavel" };

/** history = mais antigo -> mais recente (até 8 semanas). */
export function analyzeSignalTrend(history: CsSignal[]): SignalTrend {
  const h = history.filter((s) => s !== "sem_dado");
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
