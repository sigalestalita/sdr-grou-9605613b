/**
 * Motor de cadência do SDR baseado no Playbook de Pré-Vendas 2026.
 * Puro (sem acesso a banco) — usado tanto no servidor quanto na UI.
 */
import {
  SLA_FIRST_TOUCH_MINUTES,
  TRACK_STEPS,
  type CadenceStep,
  type SdrTrack,
} from "./sdr-playbook";

const DAY_MS = 86400000;
/** 09:00 e 15:00 em Brasília (UTC-3) expressos em horas UTC. */
const PERIOD_UTC_HOUR: Record<CadenceStep["period"], number> = { manha: 12, tarde: 18 };

export type CadenceStepState = CadenceStep & {
  dueAt: string;
  done: boolean;
  doneAt: string | null;
  status: "feito" | "atrasado" | "hoje" | "futuro";
};

export type LeadCadenceSizeInput = {
  company_size?: string | null;
  linkedin_company_size?: string | null;
  lead_type?: string | null;
};

/** Extrai o maior número de funcionários citado em textos livres ("51-200", "500+", "1.200"). */
export function parseHeadcount(value?: string | null): number | null {
  if (!value) return null;
  const nums = value
    .replace(/\./g, "")
    .match(/\d+/g)
    ?.map((n) => Number(n))
    .filter((n) => Number.isFinite(n));
  if (!nums || nums.length === 0) return null;
  return Math.max(...nums);
}

/** Trilha sugerida pelo porte da empresa (PF/consultoria seguem a trilha curta). */
export function suggestTrack(lead: LeadCadenceSizeInput): SdrTrack {
  const size = parseHeadcount(lead.company_size) ?? parseHeadcount(lead.linkedin_company_size);
  if (lead.lead_type === "pessoa_fisica") return "pme";
  if (size == null) return "mid";
  if (size < 100) return "pme";
  if (size <= 500) return "mid";
  return "enterprise";
}

export function resolveTrack(lead: LeadCadenceSizeInput & { cadence_track?: string | null }): SdrTrack {
  const t = lead.cadence_track;
  if (t === "pme" || t === "mid" || t === "enterprise") return t;
  return suggestTrack(lead);
}

function dueAtFor(startAt: Date, s: CadenceStep): string {
  const base = new Date(
    Date.UTC(startAt.getUTCFullYear(), startAt.getUTCMonth(), startAt.getUTCDate()),
  );
  return new Date(base.getTime() + (s.day - 1) * DAY_MS + PERIOD_UTC_HOUR[s.period] * 3600000).toISOString();
}

export type CadencePlan = {
  track: SdrTrack;
  startAt: string;
  steps: CadenceStepState[];
  total: number;
  doneCount: number;
  lateCount: number;
  todayCount: number;
  progress: number;
  nextStep: CadenceStepState | null;
  /** Primeiro passo atrasado (o que o SDR deve resgatar). */
  firstLateStep: CadenceStepState | null;
  breakupDone: boolean;
  finished: boolean;
};

export function buildCadencePlan(input: {
  track: SdrTrack;
  startAt: string | Date;
  /** stepId -> data em que foi executado. */
  doneMap: Record<string, string>;
  now?: Date;
}): CadencePlan {
  const now = input.now ?? new Date();
  const start = typeof input.startAt === "string" ? new Date(input.startAt) : input.startAt;
  const todayKey = now.toISOString().slice(0, 10);

  const steps: CadenceStepState[] = TRACK_STEPS[input.track].map((s) => {
    const dueAt = dueAtFor(start, s);
    const doneAt = input.doneMap[s.id] ?? null;
    const dueKey = dueAt.slice(0, 10);
    const status: CadenceStepState["status"] = doneAt
      ? "feito"
      : dueKey === todayKey
        ? "hoje"
        : new Date(dueAt).getTime() < now.getTime()
          ? "atrasado"
          : "futuro";
    return { ...s, dueAt, done: !!doneAt, doneAt, status };
  });

  const pending = steps.filter((s) => !s.done);
  const late = pending.filter((s) => s.status === "atrasado");
  const breakupDone = steps.some((s) => s.breakup && s.done);

  return {
    track: input.track,
    startAt: start.toISOString(),
    steps,
    total: steps.length,
    doneCount: steps.length - pending.length,
    lateCount: late.length,
    todayCount: pending.filter((s) => s.status === "hoje").length,
    progress: steps.length ? (steps.length - pending.length) / steps.length : 0,
    nextStep: pending[0] ?? null,
    firstLateStep: late[0] ?? null,
    breakupDone,
    finished: pending.length === 0,
  };
}

export type SlaState = {
  minutes: number | null;
  status: "ok" | "estourado" | "pendente" | "sem_dado";
  limitMinutes: number;
};

/** SLA de primeiro atendimento: da conversão até o primeiro touch registrado. */
export function evaluateSla(input: {
  createdAt?: string | null;
  convertedAt?: string | null;
  firstTouchAt?: string | null;
  now?: Date;
}): SlaState {
  const limitMinutes = SLA_FIRST_TOUCH_MINUTES;
  const startISO = input.convertedAt ?? input.createdAt;
  if (!startISO) return { minutes: null, status: "sem_dado", limitMinutes };
  const start = new Date(startISO).getTime();
  if (input.firstTouchAt) {
    const minutes = Math.max(0, Math.round((new Date(input.firstTouchAt).getTime() - start) / 60000));
    return { minutes, status: minutes <= limitMinutes ? "ok" : "estourado", limitMinutes };
  }
  const minutes = Math.max(0, Math.round(((input.now ?? new Date()).getTime() - start) / 60000));
  return { minutes, status: minutes <= limitMinutes ? "pendente" : "estourado", limitMinutes };
}

/** Lê o stepId gravado no metadata do touch. */
export function stepIdFromTouchMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const v = (metadata as Record<string, unknown>)["cadence_step"];
  return typeof v === "string" ? v : null;
}
