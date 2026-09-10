import { describe, expect, it } from "vitest";
import { formatLeft, lastInboundFrom, serviceWindow } from "./service-window";

const NOW = new Date("2026-09-10T15:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600000).toISOString();

describe("serviceWindow", () => {
  it("lead que nunca escreveu: janela nunca abriu, só template", () => {
    const w = serviceWindow(null, NOW);
    expect(w.state).toBe("sem_contato");
    expect(w.canSendFreeText).toBe(false);
    expect(w.expiresAt).toBeNull();
  });

  it("resposta recente: janela aberta com o tempo restante", () => {
    const w = serviceWindow(hoursAgo(2), NOW);
    expect(w.state).toBe("aberta");
    expect(w.canSendFreeText).toBe(true);
    expect(w.label).toContain("22h");
  });

  it("faltando menos de 3h: entra em fechando", () => {
    const w = serviceWindow(hoursAgo(22), NOW);
    expect(w.state).toBe("fechando");
    expect(w.canSendFreeText).toBe(true);
    expect(w.label).toContain("2h");
  });

  it("passou de 24h: fechada e mensagem livre bloqueada", () => {
    const w = serviceWindow(hoursAgo(25), NOW);
    expect(w.state).toBe("fechada");
    expect(w.canSendFreeText).toBe(false);
    expect(w.msLeft).toBe(0);
  });

  it("exatamente 24h já conta como fechada", () => {
    expect(serviceWindow(hoursAgo(24), NOW).state).toBe("fechada");
  });

  it("marca a hora em que a janela fecha", () => {
    const w = serviceWindow("2026-09-10T09:00:00Z", NOW);
    expect(w.expiresAt).toBe("2026-09-11T09:00:00.000Z");
  });
});

describe("formatLeft", () => {
  it("formata horas e minutos", () => {
    expect(formatLeft(6 * 3600000 + 20 * 60000)).toBe("6h20");
    expect(formatLeft(2 * 3600000)).toBe("2h");
    expect(formatLeft(45 * 60000)).toBe("45min");
    expect(formatLeft(0)).toBe("0min");
    expect(formatLeft(-1000)).toBe("0min");
  });
});

describe("lastInboundFrom", () => {
  it("pega a mensagem mais recente do lead, ignorando as do time", () => {
    const last = lastInboundFrom([
      { sender_type: "lead", created_at: "2026-09-09T10:00:00Z" },
      { sender_type: "sdr", created_at: "2026-09-10T14:00:00Z" },
      { sender_type: "lead", created_at: "2026-09-10T09:57:00Z" },
      { sender_type: "bot", created_at: "2026-09-10T12:00:00Z" },
    ]);
    expect(last).toBe("2026-09-10T09:57:00Z");
  });

  it("devolve null quando só houve mensagem do time", () => {
    expect(
      lastInboundFrom([{ sender_type: "sdr", created_at: "2026-09-10T14:00:00Z" }]),
    ).toBeNull();
  });
});
