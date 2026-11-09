import { describe, expect, it } from "vitest";
import { normalizarSpec, specVazio } from "./catalogo";

describe("normalizarSpec", () => {
  it("remove dimensões, métricas, datas e filtros fora da base", () => {
    const s = normalizarSpec({
      ...specVazio("negocios"),
      dimensoes: ["dono", "inventada", "dono", "funil"],
      metricas: ["valor_total", "nao_existe"],
      periodo: { campo: "data_falsa", de: "2026-01-01", ate: null },
      filtros: [
        { campo: "status", operador: "igual", valor: "Ganho" },
        { campo: "senha", operador: "igual", valor: "x" },
      ],
      ordenar_por: "inventada",
    });
    expect(s.dimensoes).toEqual(["dono", "funil"]);
    expect(s.metricas).toEqual(["valor_total"]);
    expect(s.periodo).toBeNull();
    expect(s.filtros).toHaveLength(1);
    expect(s.ordenar_por).toBeNull();
  });
  it("sem métrica válida, usa quantidade; datas fora do formato caem", () => {
    const s = normalizarSpec({
      ...specVazio("leads"),
      metricas: ["x"],
      periodo: { campo: "created_at", de: "01/01/2026", ate: "2026-03-31" },
    });
    expect(s.metricas).toEqual(["quantidade"]);
    expect(s.periodo).toEqual({ campo: "created_at", de: null, ate: "2026-03-31" });
  });
});
