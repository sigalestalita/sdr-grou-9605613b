import { describe, expect, it } from "vitest";
import { ESPERA, driveTransform, type TransformCall, type TransformSlice } from "./rd-drive";

ESPERA.entreTentativasMs = 0;

describe("driveTransform", () => {
  it("divide a fatia que falha e segue até o fim, pulando só o que não passa", async () => {
    const vistos: Array<[number, number]> = [];
    const fatia = (deals: Record<string, number> = {}): TransformSlice => ({
      companies: {},
      contacts: {},
      deals,
      dedupe: {},
      products: 0,
      errors: [],
    });
    const call: TransformCall = async ({ only, offset = 0, limit = 0 }) => {
      if (only[0] === "deals") {
        // fatias grandes estouram; o registro 120 sempre falha
        if (limit > 100) throw new Error("statement timeout");
        if (offset <= 120 && 120 < offset + limit) throw new Error("registro ruim");
        vistos.push([offset, limit]);
        return fatia({ created: limit });
      }
      return fatia();
    };
    const log: string[] = [];
    const r = await driveTransform(call, { organizations: 0, contacts: 0, deals: 800 }, true, (s) =>
      log.push(s),
    );
    const cobertos = vistos.reduce((a, [, l]) => a + l, 0);
    // tudo menos a fatia mínima com o registro ruim
    expect(cobertos).toBeGreaterThanOrEqual(800 - 50);
    expect(r.deals.created).toBe(cobertos);
    expect(r.errors.some((e) => e.includes("pulado"))).toBe(true);
  });
});
