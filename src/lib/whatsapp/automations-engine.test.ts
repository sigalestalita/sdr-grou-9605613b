import { describe, expect, it } from "vitest";
import { cruzarMensagensComLeads } from "./automations-engine.server";

describe("cruzarMensagensComLeads", () => {
  const donos = new Map([
    ["conv-1", "lead-1"],
    ["conv-2", "lead-2"],
  ]);

  it("marca o lead que escreveu", () => {
    const r = cruzarMensagensComLeads(donos, [{ conversation_id: "conv-1", sender_type: "lead" }]);
    expect([...r]).toEqual(["lead-1"]);
  });

  it("ignora mensagem que não é do lead", () => {
    const r = cruzarMensagensComLeads(donos, [
      { conversation_id: "conv-1", sender_type: "ai" },
      { conversation_id: "conv-2", sender_type: "sdr" },
    ]);
    expect(r.size).toBe(0);
  });

  it("ignora conversa sem lead conhecido", () => {
    const r = cruzarMensagensComLeads(donos, [{ conversation_id: "conv-9", sender_type: "lead" }]);
    expect(r.size).toBe(0);
  });

  it("não repete o lead com várias mensagens", () => {
    const r = cruzarMensagensComLeads(donos, [
      { conversation_id: "conv-1", sender_type: "lead" },
      { conversation_id: "conv-1", sender_type: "lead" },
    ]);
    expect(r.size).toBe(1);
  });
});
