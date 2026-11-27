import { describe, expect, it } from "vitest";
import { ancorar, antesDoInicio, inicioIso, lerInicioOperacao } from "./inicio-operacao";

describe("início da operação do CS", () => {
  const ini = inicioIso("2026-11-27");

  it("lê só datas válidas", () => {
    expect(lerInicioOperacao({ data: "2026-11-27" })).toBe("2026-11-27");
    expect(lerInicioOperacao({ data: "27/11/2026" })).toBeNull();
    expect(lerInicioOperacao(null)).toBeNull();
  });

  it("começa à meia-noite de Brasília", () => {
    expect(ini).toBe("2026-11-27T03:00:00.000Z");
  });

  it("datas antigas passam a contar do início; as novas ficam", () => {
    expect(ancorar("2026-08-24T12:00:00Z", ini)).toBe(ini);
    expect(ancorar("2026-11-28T12:00:00Z", ini)).toBe("2026-11-28T12:00:00Z");
    expect(ancorar(null, ini)).toBe(ini);
    expect(ancorar("2026-08-24T12:00:00Z", null)).toBe("2026-08-24T12:00:00Z");
  });

  it("vencido antes do início não é atraso", () => {
    expect(antesDoInicio("2026-11-26T20:00:00Z", ini)).toBe(true);
    expect(antesDoInicio("2026-11-27T10:00:00Z", ini)).toBe(false);
    expect(antesDoInicio("2026-01-01T00:00:00Z", null)).toBe(false);
  });
});
