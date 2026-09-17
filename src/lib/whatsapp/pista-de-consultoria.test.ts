import { describe, expect, it } from "vitest";
import { falaDeConsultoria } from "./pista-de-consultoria";

describe("falaDeConsultoria", () => {
  it("reconhece a palavra com e sem acento", () => {
    expect(falaDeConsultoria(["tenho uma consultoria de RH"])).toBe(true);
    expect(falaDeConsultoria(["sou consultora independente"])).toBe(true);
    expect(falaDeConsultoria(["trabalho como consultor"])).toBe(true);
  });

  it("reconhece quem descreve o trabalho sem usar a palavra", () => {
    expect(falaDeConsultoria(["eu atendo outras empresas"])).toBe(true);
    expect(falaDeConsultoria(["quero aplicar nos meus clientes"])).toBe(true);
    expect(falaDeConsultoria(["sou mentora de lideranças"])).toBe(true);
  });

  it("não dispara em conversa de empresa", () => {
    expect(falaDeConsultoria(["é para a minha equipe interna"])).toBe(false);
    expect(falaDeConsultoria(["somos 30 pessoas no RH"])).toBe(false);
  });

  it("aguenta texto vazio", () => {
    expect(falaDeConsultoria([])).toBe(false);
    expect(falaDeConsultoria([null, undefined, "  "])).toBe(false);
  });

  it("olha todas as mensagens, não só a última", () => {
    expect(falaDeConsultoria(["oi", "tenho uma consultoria", "obrigada"])).toBe(true);
  });
});
