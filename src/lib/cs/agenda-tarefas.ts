/*
 * Agenda de tarefas do CS (regra pura): em que dias e horários cada pessoa
 * recebe tarefas, quantos atendimentos por dia, feriados e ausências (férias,
 * licença, folga). Um dia indisponível não recebe card nem tarefa: o que cairia
 * nele vai para o próximo dia disponível — assim nada acumula enquanto a pessoa
 * não está.
 */

export type ConfigAgenda = {
  /** Dias da semana de trabalho (1 = segunda … 6 = sábado, 0 = domingo). */
  dias: number[];
  /** Horário de trabalho (HH:MM, horário de Brasília). */
  inicio: string;
  fim: string;
  atendimentos_por_dia: number;
  feriados: Array<{ data: string; nome: string }>;
  /** Exceções por pessoa (user id): dias e capacidade próprios. */
  por_pessoa: Record<string, { dias?: number[]; atendimentos_por_dia?: number }>;
};

export type Ausencia = {
  userId: string;
  inicio: string; // aaaa-mm-dd
  fim: string; // aaaa-mm-dd (inclusive)
  motivo?: string | null;
};

/** Feriados nacionais (fixos e móveis) de 2026 e 2027. A gestão edita a lista. */
export const FERIADOS_NACIONAIS: Array<{ data: string; nome: string }> = [
  { data: "2026-01-01", nome: "Confraternização Universal" },
  { data: "2026-02-16", nome: "Carnaval" },
  { data: "2026-02-17", nome: "Carnaval" },
  { data: "2026-04-03", nome: "Sexta-feira Santa" },
  { data: "2026-04-21", nome: "Tiradentes" },
  { data: "2026-05-01", nome: "Dia do Trabalho" },
  { data: "2026-06-04", nome: "Corpus Christi" },
  { data: "2026-09-07", nome: "Independência" },
  { data: "2026-10-12", nome: "Nossa Senhora Aparecida" },
  { data: "2026-11-02", nome: "Finados" },
  { data: "2026-11-15", nome: "Proclamação da República" },
  { data: "2026-11-20", nome: "Consciência Negra" },
  { data: "2026-12-25", nome: "Natal" },
  { data: "2027-01-01", nome: "Confraternização Universal" },
  { data: "2027-02-08", nome: "Carnaval" },
  { data: "2027-02-09", nome: "Carnaval" },
  { data: "2027-03-26", nome: "Sexta-feira Santa" },
  { data: "2027-04-21", nome: "Tiradentes" },
  { data: "2027-05-01", nome: "Dia do Trabalho" },
  { data: "2027-05-27", nome: "Corpus Christi" },
  { data: "2027-09-07", nome: "Independência" },
  { data: "2027-10-12", nome: "Nossa Senhora Aparecida" },
  { data: "2027-11-02", nome: "Finados" },
  { data: "2027-11-15", nome: "Proclamação da República" },
  { data: "2027-11-20", nome: "Consciência Negra" },
  { data: "2027-12-25", nome: "Natal" },
];

export const AGENDA_PADRAO: ConfigAgenda = {
  dias: [1, 2, 3, 4, 5],
  inicio: "08:00",
  fim: "18:00",
  atendimentos_por_dia: 8,
  feriados: FERIADOS_NACIONAIS,
  por_pessoa: {},
};

export const NOME_DIA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** Dia da semana (0 = domingo) de uma data aaaa-mm-dd, sem depender de fuso. */
export function diaDaSemana(ymd: string): number {
  return new Date(`${ymd}T12:00:00Z`).getUTCDay();
}

export function somarDias(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function diasDaPessoa(cfg: ConfigAgenda, userId: string | null | undefined): number[] {
  const p = userId ? cfg.por_pessoa[userId] : undefined;
  return p?.dias?.length ? p.dias : cfg.dias;
}

export function capacidadeDaPessoa(cfg: ConfigAgenda, userId: string | null | undefined): number {
  const p = userId ? cfg.por_pessoa[userId] : undefined;
  return p?.atendimentos_por_dia ?? cfg.atendimentos_por_dia;
}

/**
 * Por que o dia não está disponível para a pessoa (null = disponível):
 * fora dos dias de trabalho, feriado ou ausência.
 */
export function motivoIndisponivel(
  ymd: string,
  userId: string | null | undefined,
  cfg: ConfigAgenda,
  ausencias: Ausencia[],
): string | null {
  const feriado = cfg.feriados.find((f) => f.data === ymd);
  if (feriado) return `feriado (${feriado.nome})`;
  const dia = diaDaSemana(ymd);
  if (!diasDaPessoa(cfg, userId).includes(dia)) return `não trabalha ${NOME_DIA[dia]}`;
  if (userId) {
    const a = ausencias.find((x) => x.userId === userId && x.inicio <= ymd && ymd <= x.fim);
    if (a) return a.motivo ? `ausente (${a.motivo})` : "ausente";
  }
  return null;
}

/** Primeiro dia disponível a partir de `ymd` (inclusive); até 120 dias à frente. */
export function proximoDiaDisponivel(
  ymd: string,
  userId: string | null | undefined,
  cfg: ConfigAgenda,
  ausencias: Ausencia[],
): string {
  let d = ymd;
  for (let i = 0; i < 120; i++) {
    if (!motivoIndisponivel(d, userId, cfg, ausencias)) return d;
    d = somarDias(d, 1);
  }
  return ymd;
}

/** Dias (1 = segunda … 5 = sexta) da semana em que a pessoa recebe cards. */
export function diasDisponiveisNaSemana(
  weekStart: string,
  userId: string | null | undefined,
  cfg: ConfigAgenda,
  ausencias: Ausencia[],
): number[] {
  return [1, 2, 3, 4, 5].filter(
    (wd) => !motivoIndisponivel(somarDias(weekStart, wd - 1), userId, cfg, ausencias),
  );
}

/**
 * Ajusta a data/hora de uma tarefa: se o dia não está disponível para o dono,
 * vai para o próximo dia disponível, no horário de início do expediente.
 * Datas e horas em Brasília (UTC-3).
 */
export function ajustarVencimento(
  iso: string,
  userId: string | null | undefined,
  cfg: ConfigAgenda,
  ausencias: Ausencia[],
): { iso: string; movida: boolean; motivo: string | null } {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return { iso, movida: false, motivo: null };
  const local = new Date(t.getTime() - 3 * 3600_000); // Brasília
  const ymd = local.toISOString().slice(0, 10);
  const motivo = motivoIndisponivel(ymd, userId, cfg, ausencias);
  if (!motivo) return { iso, movida: false, motivo: null };
  const novo = proximoDiaDisponivel(ymd, userId, cfg, ausencias);
  const [h, m] = (cfg.inicio || "08:00").split(":").map(Number);
  const utc = new Date(`${novo}T00:00:00Z`);
  utc.setUTCHours((h || 8) + 3, m || 0, 0, 0);
  return { iso: utc.toISOString(), movida: true, motivo };
}

/** Normaliza o que veio salvo (campos faltando caem no padrão). */
export function lerConfigAgenda(v: unknown): ConfigAgenda {
  const o = (v ?? {}) as Partial<ConfigAgenda>;
  const dias = Array.isArray(o.dias) && o.dias.length ? o.dias.map(Number) : AGENDA_PADRAO.dias;
  return {
    dias,
    inicio: typeof o.inicio === "string" ? o.inicio : AGENDA_PADRAO.inicio,
    fim: typeof o.fim === "string" ? o.fim : AGENDA_PADRAO.fim,
    atendimentos_por_dia:
      Number(o.atendimentos_por_dia) > 0
        ? Number(o.atendimentos_por_dia)
        : AGENDA_PADRAO.atendimentos_por_dia,
    feriados: Array.isArray(o.feriados) ? o.feriados : AGENDA_PADRAO.feriados,
    por_pessoa: o.por_pessoa && typeof o.por_pessoa === "object" ? o.por_pessoa : {},
  };
}
