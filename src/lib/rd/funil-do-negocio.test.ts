import { describe, expect, it } from "vitest";
import { funilDoNegocio, type MapaDeFunis } from "./rd-api.server";

const mapa: MapaDeFunis = {
  porFunil: new Map([["f1", "Vendas"]]),
  porEtapa: new Map([["e9", "Leads - Empresa [SDR]"]]),
};

describe("funilDoNegocio", () => {
  it("usa o nome que vier no negócio", () => {
    expect(funilDoNegocio({ deal_pipeline: { _id: "x", name: "Vendas" } }, mapa)).toBe("Vendas");
  });
  it("sem nome, acha pelo id do funil ou pelo id da etapa", () => {
    expect(funilDoNegocio({ deal_pipeline: { _id: "f1" } }, mapa)).toBe("Vendas");
    expect(funilDoNegocio({ deal_stage: { _id: "e9", name: "Abordagem" } }, mapa)).toBe(
      "Leads - Empresa [SDR]",
    );
  });
  it("sem mapa nem nome, fica sem funil", () => {
    expect(funilDoNegocio({ deal_stage: { _id: "e9" } }, null)).toBeNull();
  });
});
