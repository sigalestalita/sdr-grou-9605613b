import { describe, expect, it } from "vitest";
import { emailFromIcsUrl, parseGoogleIcs, validateIcsUrl } from "./gcal.server";

const ICS = `BEGIN:VCALENDAR
X-WR-TIMEZONE:America/Sao_Paulo
BEGIN:VEVENT
DTSTART;TZID=America/Sao_Paulo:20260901T100000
DTEND;TZID=America/Sao_Paulo:20260901T110000
UID:simples@google.com
SUMMARY:Onboarding \\, Acme
LOCATION:https://meet.google.com/abc-defg-hij
ORGANIZER;CN=Ana:mailto:ana@grou.com.br
ATTENDEE;CUTYPE=INDIVIDUAL;PARTSTAT=ACCEPTED;CN=Ana:mailto:ana@grou.com.br
ATTENDEE;CUTYPE=INDIVIDUAL;PARTSTAT=ACCEPTED;CN=João Cliente:mailto:joao@acme.com.b
 r
STATUS:CONFIRMED
END:VEVENT
BEGIN:VEVENT
DTSTART:20260902T130000Z
DTEND:20260902T133000Z
UID:semanal@google.com
RRULE:FREQ=WEEKLY;COUNT=4
EXDATE:20260916T130000Z
SUMMARY:Check-in semanal
ATTENDEE;PARTSTAT=NEEDS-ACTION:mailto:maria@acme.com.br
END:VEVENT
BEGIN:VEVENT
DTSTART:20260909T140000Z
DTEND:20260909T143000Z
UID:semanal@google.com
RECURRENCE-ID:20260909T130000Z
SUMMARY:Check-in semanal (remarcado)
ATTENDEE;PARTSTAT=ACCEPTED:mailto:maria@acme.com.br
END:VEVENT
BEGIN:VEVENT
DTSTART:20260905T120000Z
DTEND:20260905T130000Z
UID:cancelado@google.com
SUMMARY:Cancelada
STATUS:CANCELLED
END:VEVENT
END:VCALENDAR`;

describe("parseGoogleIcs", () => {
  const from = new Date("2026-08-01T00:00:00Z");
  const to = new Date("2026-10-01T00:00:00Z");
  const events = parseGoogleIcs(ICS, from, to);
  const byUri = (s: string) => events.filter((e) => e.event_uri.includes(s));

  it("converte data local no fuso da agenda e desdobra linhas", () => {
    const [e] = byUri("simples");
    expect(e.start_time).toBe("2026-09-01T13:00:00.000Z");
    expect(e.end_time).toBe("2026-09-01T14:00:00.000Z");
    expect(e.name).toBe("Onboarding , Acme");
    expect(e.meeting_url).toBe("https://meet.google.com/abc-defg-hij");
    expect(e.organizer_email).toBe("ana@grou.com.br");
    expect(e.attendees).toEqual([
      { email: "ana@grou.com.br", name: "Ana", status: "accepted" },
      { email: "joao@acme.com.br", name: "João Cliente", status: "accepted" },
    ]);
  });

  it("expande recorrência semanal com exceção e ocorrência remarcada", () => {
    const serie = byUri("semanal").map((e) => [e.start_time, e.name]);
    expect(serie).toEqual([
      ["2026-09-02T13:00:00.000Z", "Check-in semanal"],
      ["2026-09-23T13:00:00.000Z", "Check-in semanal"],
      ["2026-09-09T14:00:00.000Z", "Check-in semanal (remarcado)"],
    ]);
    // uri estável: mesma série + data da ocorrência original
    expect(byUri("semanal").map((e) => e.event_uri)).toContain(
      "google:semanal@google.com:2026-09-09T13:00:00.000Z",
    );
  });

  it("marca evento cancelado", () => {
    expect(byUri("cancelado")[0].status).toBe("canceled");
  });
});

describe("endereço iCal", () => {
  it("valida só o endereço do Google e extrai o e-mail", () => {
    const url =
      "https://calendar.google.com/calendar/ical/ana%40grou.com.br/private-abc123/basic.ics";
    expect(validateIcsUrl(url)).toBe(url);
    expect(emailFromIcsUrl(url)).toBe("ana@grou.com.br");
    expect(() => validateIcsUrl("https://exemplo.com/x.ics")).toThrow();
  });
});
