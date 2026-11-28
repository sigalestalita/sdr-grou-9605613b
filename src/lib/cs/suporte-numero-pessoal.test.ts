import { describe, expect, it } from "vitest";
import { donoFalouHaPouco } from "./suporte-numero-pessoal.server";

describe("donoFalouHaPouco", () => {
  const agora = new Date("2026-11-28T12:00:00Z").getTime();
  it("dono escreveu há 2h: a IA fica de fora", () => {
    expect(
      donoFalouHaPouco([{ sender_type: "sdr", created_at: "2026-11-28T10:00:00Z" }], agora),
    ).toBe(true);
  });
  it("dono escreveu há 2 dias (histórico): a IA pode atender", () => {
    expect(
      donoFalouHaPouco([{ sender_type: "sdr", created_at: "2026-11-26T10:00:00Z" }], agora),
    ).toBe(false);
  });
  it("só mensagens do cliente e da IA não contam como dono", () => {
    expect(
      donoFalouHaPouco(
        [
          { sender_type: "lead", created_at: "2026-11-28T11:00:00Z" },
          { sender_type: "bot", created_at: "2026-11-28T11:01:00Z" },
        ],
        agora,
      ),
    ).toBe(false);
  });
});
