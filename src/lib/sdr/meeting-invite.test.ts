import { describe, expect, it } from "vitest";
import { buildIcs, conflictsFor, freeSlots, icsFold, zonedDate, humanWhen } from "./meeting-invite";

const TZ = "America/Sao_Paulo";

describe("freeSlots", () => {
  it("sugere só dentro da janela, fora do ocupado e no futuro", () => {
    const day = "2026-09-10";
    const busy = [
      { start: zonedDate(day, 10, 0, TZ), end: zonedDate(day, 11, 0, TZ), title: "Reunião X" },
    ];
    const now = zonedDate(day, 8, 0, TZ);
    const slots = freeSlots({ day, busy, durationMin: 45, now, max: 50 });
    const labels = slots.map((d) => humanWhen(d, TZ).split(" às ")[1]);
    expect(labels[0]).toBe("09:00");
    // 09:30 + 45min = 10:15 bate com 10:00–11:00
    expect(labels).not.toContain("09:30");
    expect(labels).not.toContain("10:00");
    expect(labels).not.toContain("10:30");
    expect(labels).toContain("11:00");
    // 17:30 + 45 passa das 18:00
    expect(labels).not.toContain("17:30");
    expect(labels[labels.length - 1]).toBe("17:00");
  });

  it("não sugere horário que já passou", () => {
    const day = "2026-09-10";
    const now = zonedDate(day, 15, 10, TZ);
    const slots = freeSlots({ day, busy: [], durationMin: 30, now });
    expect(humanWhen(slots[0], TZ)).toContain("15:30");
  });

  it("conflictsFor devolve o evento que bate", () => {
    const day = "2026-09-10";
    const busy = [{ start: zonedDate(day, 14, 0, TZ), end: zonedDate(day, 15, 0, TZ), title: "A" }];
    expect(conflictsFor(zonedDate(day, 14, 30, TZ), 45, busy).map((b) => b.title)).toEqual(["A"]);
    expect(conflictsFor(zonedDate(day, 15, 0, TZ), 45, busy)).toHaveLength(0);
  });
});

describe("buildIcs", () => {
  it("gera um REQUEST com organizador, convidados e duração", () => {
    const ics = buildIcs({
      uid: "lead-1@compass.groupp.com",
      sequence: 2,
      method: "REQUEST",
      start: new Date("2026-09-10T17:30:00Z"),
      durationMin: 45,
      summary: "Grou × Empresa; Teste, Ltda",
      description: "Linha 1\nLinha 2",
      organizer: { email: "sdr@grougp.com.br", name: "Camila" },
      attendees: [
        { email: "lead@empresa.com", name: "Lead" },
        { email: "exec@grougp.com.br", name: "Exec" },
      ],
      stamp: new Date("2026-09-09T12:00:00Z"),
    });
    expect(ics).toContain("METHOD:REQUEST");
    expect(ics).toContain("SEQUENCE:2");
    expect(ics).toContain("DTSTART:20260910T173000Z");
    expect(ics).toContain("DTEND:20260910T181500Z");
    expect(ics).toContain("SUMMARY:Grou × Empresa\\; Teste\\, Ltda");
    expect(ics).toContain("DESCRIPTION:Linha 1\\nLinha 2");
    expect(ics).toContain("ORGANIZER;CN=Camila:mailto:sdr@grougp.com.br");
    expect(ics.match(/ATTENDEE;/g)).toHaveLength(2);
    expect(ics).toContain("STATUS:CONFIRMED");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("CANCEL marca o evento como cancelado", () => {
    const ics = buildIcs({
      uid: "u",
      sequence: 3,
      method: "CANCEL",
      start: new Date("2026-09-10T17:30:00Z"),
      durationMin: 30,
      summary: "x",
      organizer: { email: "a@b.c" },
      attendees: [],
    });
    expect(ics).toContain("METHOD:CANCEL");
    expect(ics).toContain("STATUS:CANCELLED");
  });

  it("dobra linhas longas em 75 octetos", () => {
    const long = "DESCRIPTION:" + "a".repeat(200);
    const folded = icsFold(long);
    for (const l of folded.split("\r\n"))
      expect(Buffer.byteLength(l, "utf8")).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe(long);
  });
});
