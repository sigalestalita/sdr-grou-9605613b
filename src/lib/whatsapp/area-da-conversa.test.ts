import { beforeEach, describe, expect, it, vi } from "vitest";
import { esquecerSeTemArea, temColunaArea } from "./area-da-conversa";

function clienteQueResponde(resposta: { error?: { code?: string; message?: string } }) {
  const limit = vi.fn().mockResolvedValue(resposta);
  const select = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ select }));
  return { db: { from }, from, select, limit };
}

describe("temColunaArea", () => {
  beforeEach(() => esquecerSeTemArea());

  it("diz que existe quando a consulta passa", async () => {
    const { db } = clienteQueResponde({});
    await expect(temColunaArea(db)).resolves.toBe(true);
  });

  it("diz que não existe diante do 42703", async () => {
    const { db } = clienteQueResponde({
      error: { code: "42703", message: "column whatsapp_conversations.area does not exist" },
    });
    await expect(temColunaArea(db)).resolves.toBe(false);
  });

  it("reconhece pelo texto quando o código não vem", async () => {
    const { db } = clienteQueResponde({
      error: { message: 'column whatsapp_conversations."area" does not exist' },
    });
    await expect(temColunaArea(db)).resolves.toBe(false);
  });

  it("pergunta ao banco uma vez só", async () => {
    const { db, from } = clienteQueResponde({});
    await temColunaArea(db);
    await temColunaArea(db);
    await temColunaArea(db);
    expect(from).toHaveBeenCalledTimes(1);
  });
});
