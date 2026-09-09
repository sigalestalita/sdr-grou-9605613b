import { describe, expect, it } from "vitest";
import { DEFAULT_JOURNEY_CONFIG, planJourney, renderJourneyBody } from "./journey";

const now = new Date("2026-09-09T12:00:00Z");

describe("Jornadas Reais", () => {
  it("quatro marcos: 30 (só recrutamento/ambos), 90, 180, 300 dias", () => {
    expect(DEFAULT_JOURNEY_CONFIG.emails.map((e) => e.dia)).toEqual([30, 90, 180, 300]);
    const all = planJourney({ licenseStart: "2026-09-01", tagUso: "ambos", now }, []);
    expect(all.map((p) => [p.emailId, p.dueAt, p.status])).toEqual([
      ["jornada-1", "2026-10-01", "agendado"],
      ["jornada-2", "2026-11-30", "agendado"],
      ["jornada-3", "2027-02-28", "agendado"],
      ["jornada-4", "2027-06-28", "agendado"],
    ]);
    expect(planJourney({ licenseStart: "2026-09-01", tagUso: "desenvolvimento", now }, []).map((p) => p.emailId)).not.toContain("jornada-1");
  });
  it("marco passado dentro da janela fica pendente; fora, expira; existentes não repetem", () => {
    const p = planJourney({ licenseStart: "2026-08-05", tagUso: "recrutamento", now }, [{ email_id: "jornada-2", status: "enviado" }]);
    expect(p.find((x) => x.emailId === "jornada-1")?.status).toBe("pendente"); // dia 30 = 04/09, 5 dias atrás
    expect(p.map((x) => x.emailId)).not.toContain("jornada-2");
    const old = planJourney({ licenseStart: "2026-01-01", tagUso: "recrutamento", now }, []);
    expect(old.find((x) => x.emailId === "jornada-1")?.status).toBe("expirado");
    expect(old.find((x) => x.emailId === "jornada-4")?.status).toBe("agendado");
  });
  it("renderiza [nome] e assinatura sem alterar o texto", () => {
    const body = renderJourneyBody("Oi [nome],\n\nTexto.", "João Silva", "Marcela");
    expect(body).toBe("Oi João,\n\nTexto.\n\nMarcela");
  });
});
