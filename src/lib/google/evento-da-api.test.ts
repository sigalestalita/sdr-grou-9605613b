import { describe, expect, it } from "vitest";
import { eventoDaApi } from "./agenda.server";

describe("eventoDaApi", () => {
  it("traz título, convidados e Meet, com o mesmo id do .ics", () => {
    const e = eventoDaApi({
      id: "abc",
      iCalUID: "abc@google.com",
      summary: "Check-in Sicredi",
      start: { dateTime: "2026-11-23T08:30:00-03:00" },
      end: { dateTime: "2026-11-23T09:00:00-03:00" },
      hangoutLink: "https://meet.google.com/xyz-abcd-efg",
      organizer: { email: "Marcela.Vaz@grougp.com.br" },
      attendees: [{ email: "Ana@Cliente.com", displayName: "Ana", responseStatus: "accepted" }],
    });
    expect(e?.name).toBe("Check-in Sicredi");
    expect(e?.event_uri).toBe("google:abc@google.com:2026-11-23T11:30:00.000Z");
    expect(e?.meeting_url).toContain("meet.google.com");
    expect(e?.attendees[0]).toEqual({ email: "ana@cliente.com", name: "Ana", status: "accepted" });
    expect(e?.organizer_email).toBe("marcela.vaz@grougp.com.br");
  });
  it("ocorrência de série usa o início original no id", () => {
    const e = eventoDaApi({
      id: "serie_20261124",
      iCalUID: "serie@google.com",
      recurringEventId: "serie",
      start: { dateTime: "2026-11-24T10:00:00-03:00" },
      originalStartTime: { dateTime: "2026-11-24T09:00:00-03:00" },
    });
    expect(e?.event_uri).toBe("google:serie@google.com:2026-11-24T12:00:00.000Z");
  });
});
