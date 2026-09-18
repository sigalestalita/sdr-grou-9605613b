import { describe, expect, it } from "vitest";
import { ehNomeDaCasa } from "./nomes-da-casa";

describe("ehNomeDaCasa", () => {
  it("barra o que é nosso, com ou sem acento e caixa", () => {
    for (const t of ["Black September", "black september", "PDA", "Grou", "PDA Assessment"]) {
      expect(ehNomeDaCasa(t)).toBe(true);
    }
  });

  it("barra com palavra de ligação na frente", () => {
    expect(ehNomeDaCasa("a Black September")).toBe(true);
    expect(ehNomeDaCasa("licença PDA")).toBe(true);
  });

  it("não barra empresa de verdade que contém a palavra", () => {
    expect(ehNomeDaCasa("Grupo Grou Alimentos")).toBe(false);
    expect(ehNomeDaCasa("PDA Engenharia Ltda")).toBe(false);
    expect(ehNomeDaCasa("Useall")).toBe(false);
    expect(ehNomeDaCasa("Arangá Consultoria")).toBe(false);
  });

  it("aguenta vazio", () => {
    expect(ehNomeDaCasa("")).toBe(false);
    expect(ehNomeDaCasa(null)).toBe(false);
    expect(ehNomeDaCasa("   ")).toBe(false);
  });
});
