/*
 * Google Agenda por usuário, sem OAuth: cada analista cola o "endereço secreto
 * em formato iCal" da própria agenda (Google Agenda → Configurações → a agenda →
 * Integrar agenda). É só leitura e vale só para aquela agenda. Aqui o .ics é
 * baixado e convertido nas mesmas linhas que o Calendly grava em
 * cs_calendly_events (provider = 'google'), com a lista de convidados — é pelo
 * e-mail do convidado que o evento é ligado ao contato/empresa.
 */

export type GcalAttendee = { email: string; name: string | null; status: string | null };

export type GcalEvent = {
  event_uri: string;
  name: string | null;
  status: string | null;
  start_time: string;
  end_time: string | null;
  location: string | null;
  meeting_url: string | null;
  organizer_email: string | null;
  attendees: GcalAttendee[];
  invitee_name: string | null;
  invitee_email: string | null;
  raw: Record<string, unknown>;
};

const ICS_HOST = /^https:\/\/calendar\.google\.com\/calendar\/ical\/.+\/basic\.ics$/i;

/** Aceita só o endereço iCal do Google (privado ou público). */
export function validateIcsUrl(url: string): string {
  const u = url.trim();
  if (!ICS_HOST.test(u))
    throw new Error(
      "Endereço inválido. Use o “endereço secreto em formato iCal” da Google Agenda (termina em basic.ics).",
    );
  return u;
}

/** E-mail da agenda, que vem codificado no caminho do endereço iCal. */
export function emailFromIcsUrl(url: string): string | null {
  const m = url.match(/\/calendar\/ical\/([^/]+)\//);
  if (!m) return null;
  const decoded = decodeURIComponent(m[1]);
  return decoded.includes("@") ? decoded.toLowerCase() : null;
}

// ---------------------------------------------------------------------------
// Parser iCalendar (o suficiente para VEVENT do Google)
// ---------------------------------------------------------------------------
type Prop = { name: string; params: Record<string, string>; value: string };
type VEvent = Record<string, Prop[]>;

function unfold(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\n[ \t]/g, "")
    .split("\n");
}

function parseLine(line: string): Prop | null {
  const i = line.indexOf(":");
  if (i < 0) return null;
  const head = line.slice(0, i);
  const value = line.slice(i + 1);
  const [name, ...rawParams] = head.split(";");
  const params: Record<string, string> = {};
  for (const p of rawParams) {
    const j = p.indexOf("=");
    if (j > 0) params[p.slice(0, j).toUpperCase()] = p.slice(j + 1).replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), params, value };
}

function parseVEvents(ics: string): VEvent[] {
  const out: VEvent[] = [];
  let cur: VEvent | null = null;
  for (const line of unfold(ics)) {
    if (line === "BEGIN:VEVENT") {
      cur = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (cur) out.push(cur);
      cur = null;
      continue;
    }
    if (!cur) continue;
    const p = parseLine(line);
    if (!p) continue;
    (cur[p.name] ??= []).push(p);
  }
  return out;
}

const unescapeText = (s: string) =>
  s.replace(/\\n/g, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");

/**
 * Datas: UTC (Z), local com TZID, ou só data (dia inteiro). Datas locais sem
 * Z usam o fuso da agenda (padrão America/Sao_Paulo) — aproximação boa o
 * bastante para saber se a reunião já terminou.
 */
function parseDate(p: Prop | undefined, calTz: string): Date | null {
  if (!p) return null;
  const v = p.value;
  if (/^\d{8}$/.test(v))
    return new Date(`${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}T00:00:00-03:00`);
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
  if (m[7] === "Z") return new Date(`${iso}Z`);
  const tz = p.params["TZID"] ?? calTz;
  return new Date(`${iso}${offsetFor(tz, new Date(`${iso}Z`))}`);
}

/** Deslocamento "-03:00" de um fuso IANA numa data (via Intl). */
function offsetFor(tz: string, at: Date): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "longOffset",
    }).formatToParts(at);
    const name = parts.find((x) => x.type === "timeZoneName")?.value ?? "GMT-03:00";
    const m = name.match(/GMT([+-]\d{2}):?(\d{2})?/);
    return m ? `${m[1]}:${m[2] ?? "00"}` : "-03:00";
  } catch {
    return "-03:00";
  }
}

const WD: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

/** Expande RRULE diária/semanal/mensal simples dentro da janela; o resto fica só a primeira ocorrência. */
function expand(
  start: Date,
  rrule: string | undefined,
  exdates: Set<number>,
  from: Date,
  to: Date,
): Date[] {
  if (!rrule) return start <= to && start >= from ? [start] : [];
  const r: Record<string, string> = {};
  for (const kv of rrule.split(";")) {
    const [k, v] = kv.split("=");
    if (k && v) r[k.toUpperCase()] = v;
  }
  const freq = r["FREQ"];
  const interval = Math.max(1, Number(r["INTERVAL"] ?? 1));
  const count = r["COUNT"] ? Number(r["COUNT"]) : Infinity;
  const until = r["UNTIL"]
    ? (parseDate({ name: "UNTIL", params: {}, value: r["UNTIL"] }, "UTC") ?? to)
    : to;
  const limit = until < to ? until : to;
  const byday = (r["BYDAY"] ?? "")
    .split(",")
    .map((d) => WD[d.slice(-2)])
    .filter((d) => d !== undefined);
  const out: Date[] = [];
  let produced = 0;
  const push = (d: Date) => {
    produced++;
    if (d >= from && d <= limit && !exdates.has(d.getTime())) out.push(d);
  };
  if (freq === "DAILY") {
    for (
      let d = new Date(start);
      d <= limit && produced < count && out.length < 400;
      d.setDate(d.getDate() + interval)
    )
      push(new Date(d));
  } else if (freq === "WEEKLY") {
    const days = byday.length ? byday : [start.getDay()];
    const weekStart = new Date(start);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    for (
      let w = new Date(weekStart);
      w <= limit && produced < count && out.length < 400;
      w.setDate(w.getDate() + 7 * interval)
    ) {
      for (const wd of days) {
        const d = new Date(w);
        d.setDate(d.getDate() + wd);
        d.setHours(start.getHours(), start.getMinutes(), start.getSeconds(), 0);
        if (d < start) continue;
        if (produced >= count) break;
        push(d);
      }
    }
  } else if (freq === "MONTHLY") {
    for (let i = 0; produced < count && out.length < 400; i += interval) {
      const d = new Date(start);
      d.setMonth(d.getMonth() + i);
      if (d > limit) break;
      push(d);
    }
  } else {
    return start <= to && start >= from ? [start] : [];
  }
  return out;
}

/** Converte o .ics em eventos dentro da janela [from, to]. */
export function parseGoogleIcs(ics: string, from: Date, to: Date): GcalEvent[] {
  const calTz = ics.match(/X-WR-TIMEZONE:([^\r\n]+)/)?.[1]?.trim() ?? "America/Sao_Paulo";
  const vevents = parseVEvents(ics);
  const overrides = new Set(
    vevents
      .filter((v) => v["RECURRENCE-ID"]?.[0])
      .map(
        (v) => `${v["UID"]?.[0]?.value}|${parseDate(v["RECURRENCE-ID"]?.[0], calTz)?.getTime()}`,
      ),
  );
  const out: GcalEvent[] = [];
  for (const v of vevents) {
    const uid = v["UID"]?.[0]?.value;
    const dtstart = parseDate(v["DTSTART"]?.[0], calTz);
    if (!uid || !dtstart) continue;
    const dtend = parseDate(v["DTEND"]?.[0], calTz);
    const durationMs = dtend ? dtend.getTime() - dtstart.getTime() : 3600000;
    const statusRaw = (v["STATUS"]?.[0]?.value ?? "CONFIRMED").toUpperCase();
    const status = statusRaw === "CANCELLED" ? "canceled" : "active";
    const summary = v["SUMMARY"]?.[0] ? unescapeText(v["SUMMARY"][0].value) : null;
    const location = v["LOCATION"]?.[0] ? unescapeText(v["LOCATION"][0].value) : null;
    const description = v["DESCRIPTION"]?.[0] ? unescapeText(v["DESCRIPTION"][0].value) : "";
    const organizer = v["ORGANIZER"]?.[0]?.value.replace(/^mailto:/i, "").toLowerCase() ?? null;
    const attendees: GcalAttendee[] = (v["ATTENDEE"] ?? [])
      .map((a) => ({
        email: a.value.replace(/^mailto:/i, "").toLowerCase(),
        name: a.params["CN"] && a.params["CN"].includes("@") ? null : (a.params["CN"] ?? null),
        status: a.params["PARTSTAT"]?.toLowerCase() ?? null,
      }))
      .filter((a) => a.email.includes("@"));
    const meetUrl =
      v["X-GOOGLE-CONFERENCE"]?.[0]?.value ??
      v["URL"]?.[0]?.value ??
      (location?.startsWith("http") ? location : null) ??
      description.match(/https:\/\/meet\.google\.com\/[a-z-]+/i)?.[0] ??
      null;
    const exdates = new Set(
      (v["EXDATE"] ?? []).flatMap((p) =>
        p.value.split(",").map((d) => parseDate({ ...p, value: d }, calTz)?.getTime() ?? 0),
      ),
    );
    const recId = parseDate(v["RECURRENCE-ID"]?.[0], calTz);
    const starts = recId ? [dtstart] : expand(dtstart, v["RRULE"]?.[0]?.value, exdates, from, to);
    for (const s of starts) {
      // ocorrência da série que tem uma exceção própria: fica com a exceção
      if (!recId && v["RRULE"] && overrides.has(`${uid}|${s.getTime()}`)) continue;
      const e = new Date(s.getTime() + durationMs);
      out.push({
        event_uri: `google:${uid}:${(recId ?? s).toISOString()}`,
        name: summary,
        status,
        start_time: s.toISOString(),
        end_time: e.toISOString(),
        location,
        meeting_url: meetUrl,
        organizer_email: organizer,
        attendees,
        invitee_name: null,
        invitee_email: null,
        raw: { uid, recurring: !!v["RRULE"], recurrence_id: recId?.toISOString() ?? null },
      });
    }
  }
  return out;
}

/** Baixa o .ics e devolve os eventos da janela. */
export async function fetchGoogleCalendar(
  icsUrl: string,
  from: Date,
  to: Date,
): Promise<GcalEvent[]> {
  const res = await fetch(icsUrl, { headers: { "User-Agent": "GrouCompass/1.0" } });
  if (!res.ok) throw new Error(`Google Agenda [${res.status}]: verifique o endereço iCal`);
  const text = await res.text();
  if (!text.includes("BEGIN:VCALENDAR")) throw new Error("O endereço não devolveu uma agenda iCal");
  return parseGoogleIcs(text, from, to);
}
