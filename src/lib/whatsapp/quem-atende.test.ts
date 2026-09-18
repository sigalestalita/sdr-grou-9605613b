import { describe, expect, it } from "vitest";
import { iaPodeResponder, quemAtende, temMensagemDeHumano } from "./quem-atende";

describe("quemAtende", () => {
  it("é da IA enquanto a conversa está aberta e ninguém entrou", () => {
    expect(quemAtende({ status: "open" })).toBe("ia");
    expect(iaPodeResponder({ status: "open" })).toBe(true);
  });

  it("vira espera assim que o bastão é passado", () => {
    expect(quemAtende({ status: "pending" })).toBe("aguardando_humano");
    expect(iaPodeResponder({ status: "pending" })).toBe(false);
  });

  it("é da pessoa depois de assumir, mesmo com a conversa aberta de novo", () => {
    const e = { status: "open", assumedAt: "2026-09-18T12:00:00Z" };
    expect(quemAtende(e)).toBe("humano");
    expect(iaPodeResponder(e)).toBe(false);
  });

  it("é da pessoa quando alguém já escreveu, mesmo sem clicar em assumir", () => {
    const e = { status: "open", temMensagemHumana: true };
    expect(quemAtende(e)).toBe("humano");
    expect(iaPodeResponder(e)).toBe(false);
  });

  it("encerrada ganha de tudo", () => {
    expect(quemAtende({ status: "closed", assumedAt: "2026-09-18T12:00:00Z" })).toBe("encerrada");
    expect(iaPodeResponder({ status: "closed" })).toBe(false);
  });
});

describe("temMensagemDeHumano", () => {
  it("ignora o que a IA e as automações escreveram", () => {
    expect(
      temMensagemDeHumano([
        { sender_type: "lead" },
        { sender_type: "bot" },
        { sender_type: "automation" },
      ]),
    ).toBe(false);
  });

  it("reconhece os três jeitos de registrar gente", () => {
    for (const t of ["sdr", "agent", "human"]) {
      expect(temMensagemDeHumano([{ sender_type: t }])).toBe(true);
    }
  });
});
