import { describe, expect, it } from "vitest";
import { corpoDoEvento, urlDeAutorizacao } from "./agenda";

describe("Google Agenda", () => {
  it("pede acesso offline com consentimento (para vir o refresh_token)", () => {
    const u = new URL(
      urlDeAutorizacao({
        clientId: "abc",
        redirectUri: "https://x/cb",
        estado: "s1",
        emailSugerido: "a@b.com",
      }),
    );
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("prompt")).toBe("consent");
    expect(u.searchParams.get("scope")).toContain("calendar.events");
    expect(u.searchParams.get("state")).toBe("s1");
    expect(u.searchParams.get("login_hint")).toBe("a@b.com");
  });

  it("monta o evento com fim, convidados sem repetição e Meet quando não há link", () => {
    const c = corpoDoEvento(
      {
        id: "m1",
        titulo: "Reunião",
        inicio: new Date("2026-12-02T14:00:00Z"),
        duracaoMin: 45,
        convidados: [{ email: "A@x.com", nome: "Ana" }, { email: "a@x.com" }, { email: "" }],
      },
      true,
    );
    expect(c.end.dateTime).toBe("2026-12-02T14:45:00.000Z");
    expect(c.attendees).toEqual([{ email: "a@x.com", displayName: "Ana" }]);
    expect(c.conferenceData?.createRequest.requestId).toBe("compass-m1");
  });

  it("não cria Meet quando a reunião já tem link", () => {
    const c = corpoDoEvento(
      {
        id: "m2",
        titulo: "R",
        inicio: new Date(),
        duracaoMin: 30,
        link: "https://zoom.us/j/1",
        convidados: [],
      },
      true,
    );
    expect(c.conferenceData).toBeUndefined();
    expect(c.location).toBe("https://zoom.us/j/1");
  });
});
