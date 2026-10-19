import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
const { toNumber } = await import("./rd-transform.server");

describe("toNumber", () => {
  it("entende o formato brasileiro e o ponto decimal", () => {
    expect(toNumber("1.500,00")).toBe(1500);
    expect(toNumber("R$ 3.100,50")).toBe(3100.5);
    expect(toNumber("1500.00")).toBe(1500);
    expect(toNumber("1500.5")).toBe(1500.5);
    expect(toNumber("1.500")).toBe(1500);
    expect(toNumber("12.000.000")).toBe(12000000);
    expect(toNumber("250")).toBe(250);
    expect(toNumber("")).toBeNull();
    expect(toNumber("abc")).toBeNull();
  });
});
