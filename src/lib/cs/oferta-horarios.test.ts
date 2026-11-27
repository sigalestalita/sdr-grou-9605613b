import { describe, expect, it } from "vitest";
import { horariosDisponiveis, validarHorarios } from "./oferta-horarios";

const agora = new Date("2026-12-01T12:00:00Z");

describe("oferta de horários", () => {
  it("ordena e aceita horários futuros sem sobreposição", () => {
    const r = validarHorarios(["2026-12-03T15:00:00Z", "2026-12-02T14:00:00Z"], 60, agora);
    expect(r).toEqual({
      ok: true,
      horarios: ["2026-12-02T14:00:00.000Z", "2026-12-03T15:00:00.000Z"],
    });
  });
  it("exige pelo menos dois", () => {
    expect(validarHorarios(["2026-12-02T14:00:00Z"], 60, agora).ok).toBe(false);
  });
  it("recusa passado e sobreposição", () => {
    expect(validarHorarios(["2026-11-30T14:00:00Z", "2026-12-02T14:00:00Z"], 60, agora).ok).toBe(
      false,
    );
    expect(validarHorarios(["2026-12-02T14:00:00Z", "2026-12-02T14:30:00Z"], 60, agora).ok).toBe(
      false,
    );
    expect(validarHorarios(["2026-12-02T14:00:00Z", "2026-12-02T15:00:00Z"], 60, agora).ok).toBe(
      true,
    );
  });
  it("só mostra ao cliente os horários que ainda não passaram", () => {
    const l = horariosDisponiveis(
      [{ inicio: "2026-12-02T14:00:00Z" }, { inicio: "2026-11-30T14:00:00Z" }],
      agora,
    );
    expect(l).toEqual([{ inicio: "2026-12-02T14:00:00Z" }]);
  });
});
