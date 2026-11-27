import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));

describe("mesmoValor (sincronização com o RD)", async () => {
  const { mesmoValor } = await import("./rd-transform.server");

  it("datas iguais em formatos diferentes", () => {
    expect(mesmoValor("2026-11-08T06:25:54+00:00", "2026-11-08T06:25:54.000Z")).toBe(true);
    expect(mesmoValor("2026-11-08", "2026-11-09")).toBe(false);
  });

  it("números e texto numérico", () => {
    expect(mesmoValor(1500, "1500")).toBe(true);
    expect(mesmoValor(1500, 1500.5)).toBe(false);
  });

  it("vazio é nulo", () => {
    expect(mesmoValor(null, "")).toBe(true);
    expect(mesmoValor(undefined, null)).toBe(true);
    expect(mesmoValor(null, "x")).toBe(false);
  });

  it("texto comum", () => {
    expect(mesmoValor("Envio de Proposta", "Envio de Proposta")).toBe(true);
    expect(mesmoValor("a", "b")).toBe(false);
  });
});
