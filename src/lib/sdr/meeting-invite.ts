/*
 * Convite de reunião SDR → executivo: parte pura (sem banco, sem rede).
 *  - buildIcs: o arquivo .ics (METHOD:REQUEST / CANCEL) que vai anexado ao
 *    e-mail. Gmail/Outlook reconhecem e oferecem "adicionar à agenda"; quando
 *    o convidado aceita, o evento entra na agenda dele.
 *  - freeSlots: horários livres do executivo num dia, a partir dos eventos
 *    ocupados (agenda Google sincronizada + outras reuniões marcadas no CRM).
 */

export type Interval = { start: Date; end: Date; title?: string | null };

export type MeetingSettings = {
  /** Duração padrão da reunião (min). */
  duration_min: number;
  /** Janela comercial em que o sistema sugere horários (hora local). */
  hours: { start: number; end: number };
  /** Passo das sugestões (min). */
  step_min: number;
  /** Remetente dos e-mails (domínio verificado no Resend). */
  from_email: string;
  /** Fuso da operação. */
  tz: string;
};

export const DEFAULT_MEETING_SETTINGS: MeetingSettings = {
  duration_min: 45,
  hours: { start: 9, end: 18 },
  step_min: 30,
  from_email: "sdr@grougp.com.br",
  tz: "America/Sao_Paulo",
};

/** Deslocamento "-03:00" de um fuso IANA numa data. */
export function tzOffset(tz: string, at: Date): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" })
      .formatToParts(at)
      .find((x) => x.type === "timeZoneName")?.value;
    const m = parts?.match(/GMT([+-]\d{2}):?(\d{2})?/);
    return m ? `${m[1]}:${m[2] ?? "00"}` : "-03:00";
  } catch {
    return "-03:00";
  }
}

/** "2026-09-10" + 14:30 no fuso → Date. */
export function zonedDate(day: string, hour: number, minute: number, tz: string): Date {
  const probe = new Date(`${day}T12:00:00Z`);
  const off = tzOffset(tz, probe);
  const p = (n: number) => String(n).padStart(2, "0");
  return new Date(`${day}T${p(hour)}:${p(minute)}:00${off}`);
}

/** "2026-09-10" da data no fuso. */
export function dayKey(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const g = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}`;
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Ocupados que batem com o horário pedido. */
export function conflictsFor(start: Date, durationMin: number, busy: Interval[]): Interval[] {
  const slot = { start, end: new Date(start.getTime() + durationMin * 60000) };
  return busy.filter((b) => overlaps(slot, b));
}

/**
 * Horários livres do dia: dentro da janela comercial, de step em step, que
 * não batem com nada ocupado e ainda não passaram.
 */
export function freeSlots(opts: {
  day: string;
  busy: Interval[];
  durationMin: number;
  settings?: Pick<MeetingSettings, "hours" | "step_min" | "tz">;
  now?: Date;
  max?: number;
}): Date[] {
  const s = { ...DEFAULT_MEETING_SETTINGS, ...(opts.settings ?? {}) };
  const now = opts.now ?? new Date();
  const out: Date[] = [];
  const end = zonedDate(opts.day, s.hours.end, 0, s.tz);
  for (
    let t = zonedDate(opts.day, s.hours.start, 0, s.tz);
    t.getTime() + opts.durationMin * 60000 <= end.getTime();
    t = new Date(t.getTime() + s.step_min * 60000)
  ) {
    if (t <= now) continue;
    if (conflictsFor(t, opts.durationMin, opts.busy).length) continue;
    out.push(t);
    if (opts.max && out.length >= opts.max) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// iCalendar
// ---------------------------------------------------------------------------
export type IcsAttendee = {
  email: string;
  name?: string | null;
  role?: "REQ-PARTICIPANT" | "OPT-PARTICIPANT";
};

export type IcsInput = {
  uid: string;
  sequence: number;
  method: "REQUEST" | "CANCEL";
  start: Date;
  durationMin: number;
  summary: string;
  description?: string;
  location?: string | null;
  url?: string | null;
  organizer: { email: string; name?: string | null };
  attendees: IcsAttendee[];
  stamp?: Date;
};

export function icsDate(d: Date): string {
  return d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

export function icsEscape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Valor de PARÂMETRO (CN=..., não o conteúdo de uma linha como SUMMARY):
 * regra é diferente da de texto — nada de contrabarra, quem tem "," ";" ":"
 * ou aspas vai entre aspas (RFC 5545 §3.2, param-value).
 */
export function icsParam(s: string): string {
  return /[,;:"]/.test(s) ? `"${s.replace(/"/g, "'")}"` : s;
}

/** Quebra linhas com mais de 75 octetos (RFC 5545 §3.1). */
export function icsFold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let cur = "";
  let curBytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch, "utf8");
    const limit = parts.length === 0 ? 75 : 74;
    if (curBytes + b > limit) {
      parts.push(cur);
      cur = "";
      curBytes = 0;
    }
    cur += ch;
    curBytes += b;
  }
  if (cur) parts.push(cur);
  return parts.join("\r\n ");
}

export function buildIcs(i: IcsInput): string {
  const end = new Date(i.start.getTime() + i.durationMin * 60000);
  const lines = [
    "BEGIN:VCALENDAR",
    "PRODID:-//Grou//Compass CRM//PT",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    `METHOD:${i.method}`,
    "BEGIN:VEVENT",
    `UID:${i.uid}`,
    `SEQUENCE:${i.sequence}`,
    `DTSTAMP:${icsDate(i.stamp ?? new Date())}`,
    `DTSTART:${icsDate(i.start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEscape(i.summary)}`,
    ...(i.description ? [`DESCRIPTION:${icsEscape(i.description)}`] : []),
    ...(i.location ? [`LOCATION:${icsEscape(i.location)}`] : []),
    ...(i.url ? [`URL:${i.url}`] : []),
    `ORGANIZER;CN=${icsParam(i.organizer.name ?? i.organizer.email)}:mailto:${i.organizer.email}`,
    ...i.attendees.map(
      (a) =>
        `ATTENDEE;CN=${icsParam(a.name ?? a.email)};ROLE=${a.role ?? "REQ-PARTICIPANT"};PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${a.email}`,
    ),
    `STATUS:${i.method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    "TRANSP:OPAQUE",
    "BEGIN:VALARM",
    "TRIGGER:-PT15M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Reunião em 15 minutos",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(icsFold).join("\r\n") + "\r\n";
}

/**
 * Link "Adicionar à Google Agenda": abre a tela de criar evento já preenchida
 * — funciona sempre que a pessoa tem conta Google, independente de o cliente
 * de e-mail reconhecer (ou não) o anexo .ics como convite. É o principal
 * caminho para a agenda entrar de fato no Google Calendar de cada um, já que
 * o reconhecimento automático do anexo varia muito entre Gmail/Outlook/apps.
 */
export function googleCalendarLink(opts: {
  title: string;
  start: Date;
  end: Date;
  details?: string;
  location?: string | null;
  guests?: string[];
}): string {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: opts.title,
    dates: `${icsDate(opts.start)}/${icsDate(opts.end)}`,
  });
  if (opts.details) p.set("details", opts.details);
  if (opts.location) p.set("location", opts.location);
  if (opts.guests?.length) p.set("add", opts.guests.join(","));
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

/** Data/hora legível para os e-mails: "quarta-feira, 10/09 às 14:30". */
export function humanWhen(d: Date, tz: string): string {
  const f = new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(d);
  const g = (t: string) => f.find((x) => x.type === t)?.value ?? "";
  return `${g("weekday")}, ${g("day")}/${g("month")} às ${g("hour")}:${g("minute")}`;
}
