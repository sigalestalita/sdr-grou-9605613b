import { describe, expect, it } from "vitest";
import { validateIcsUrl } from "./gcal.server";

describe("validateIcsUrl", () => {
  it("recusa o endereço público (só Busy) e aceita o secreto", () => {
    expect(() =>
      validateIcsUrl("https://calendar.google.com/calendar/ical/ana%40x.com/public/basic.ics"),
    ).toThrow(/endereço público/);
    expect(
      validateIcsUrl(
        "https://calendar.google.com/calendar/ical/ana%40x.com/private-abc123/basic.ics",
      ),
    ).toContain("private-abc123");
  });
});
