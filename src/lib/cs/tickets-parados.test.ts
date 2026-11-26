import { describe, expect, it } from "vitest";
import { deveAvisar, diasParado } from "./tickets-parados";

const agora = new Date("2026-11-26T12:00:00Z");
const antes = (horas: number) => new Date(agora.getTime() - horas * 3600_000).toISOString();

describe("diasParado", () => {
  it("só conta ticket em aberto parado há 72 horas ou mais", () => {
    expect(diasParado({ status: "aberto", updatedAt: antes(71) }, agora)).toBeNull();
    expect(diasParado({ status: "aberto", updatedAt: antes(72) }, agora)).toBe(3);
    expect(diasParado({ status: "aguardando_cliente", updatedAt: antes(24 * 5 + 2) }, agora)).toBe(
      5,
    );
    expect(diasParado({ status: "resolvido", updatedAt: antes(500) }, agora)).toBeNull();
    expect(diasParado({ status: "cancelado", updatedAt: antes(500) }, agora)).toBeNull();
  });
});

describe("deveAvisar", () => {
  it("avisa uma vez por parada", () => {
    const t = { status: "em_andamento", updatedAt: antes(80), paradoAvisadoEm: null };
    expect(deveAvisar(t, agora)).toBe(true);
    expect(deveAvisar({ ...t, paradoAvisadoEm: antes(10) }, agora)).toBe(false);
  });

  it("avisa de novo se o ticket mexeu depois do aviso e parou outra vez", () => {
    expect(
      deveAvisar({ status: "aberto", updatedAt: antes(80), paradoAvisadoEm: antes(200) }, agora),
    ).toBe(true);
  });
});
