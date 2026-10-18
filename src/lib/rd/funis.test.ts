import { describe, expect, it } from "vitest";
import { destinoDoFunilRd, slugDaEtapa } from "./funis";

describe("destinoDoFunilRd", () => {
  it("funis do SDR viram lead, Alianças é consultoria", () => {
    expect(destinoDoFunilRd("Leads - Empresa [SDR]")).toEqual({
      tipo: "lead",
      leadType: "empresa",
    });
    expect(destinoDoFunilRd("Leads - Alianças Estratéticas [SDR]")).toEqual({
      tipo: "lead",
      leadType: "consultoria",
    });
    expect(destinoDoFunilRd("Leads - Empresas")).toEqual({ tipo: "lead", leadType: "empresa" });
  });

  it("Vendas e funis de venda viram negócio", () => {
    expect(destinoDoFunilRd("Vendas")).toEqual({ tipo: "negocio" });
    expect(destinoDoFunilRd("CROSS SELL - Cliente")).toEqual({ tipo: "negocio" });
    expect(destinoDoFunilRd(null)).toEqual({ tipo: "negocio" });
  });

  it("carteira comercial é funil de conta", () => {
    expect(destinoDoFunilRd("Gestão da Carteira Comercial")).toEqual({
      tipo: "conta",
      pipelineSlug: "gestao-carteira-comercial",
    });
  });

  it("funis [CS] viram etapa da jornada (e não a carteira comercial)", () => {
    expect(destinoDoFunilRd("[CS] Novos")).toEqual({ tipo: "cs", journeyStage: "onboarding" });
    expect(destinoDoFunilRd("[CS] Em atendimento")).toEqual({
      tipo: "cs",
      journeyStage: "ativacao",
    });
    expect(destinoDoFunilRd("[CS] Gestão da Carteira")).toEqual({
      tipo: "cs",
      journeyStage: "renovacao",
    });
  });
});

describe("slugDaEtapa", () => {
  it("normaliza acentos e símbolos", () => {
    expect(slugDaEtapa("Reunião / Diagnóstico")).toBe("reuniao-diagnostico");
    expect(slugDaEtapa("  ")).toBe("etapa");
  });
});
