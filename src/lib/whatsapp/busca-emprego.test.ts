import { describe, expect, it } from "vitest";
import { EMAIL_DE_RH, procuraEmprego, respostaParaCandidato } from "./busca-emprego";

describe("procuraEmprego", () => {
  it("reconhece o caso real que chegou pelo anúncio", () => {
    expect(procuraEmprego("Bom dia, vocês estão contratando?")).toBe(true);
  });

  it("reconhece as outras formas de pedir vaga", () => {
    for (const t of [
      "tem vaga de analista?",
      "gostaria de enviar meu currículo",
      "posso mandar meu CV?",
      "estou procurando emprego",
      "queria trabalhar com vocês",
      "como faço para me candidatar?",
      "vocês têm processo seletivo aberto?",
    ]) {
      expect(procuraEmprego(t), t).toBe(true);
    }
  });

  it("não confunde com quem quer comprar", () => {
    for (const t of [
      "quero contratar o PDA para minha equipe",
      "como faço para contratar a licença?",
      "quero contratar vocês para um treinamento",
      "quanto custa a licença PDA?",
      "quero mais informações sobre a Black September",
    ]) {
      expect(procuraEmprego(t), t).toBe(false);
    }
  });

  it("aguenta vazio", () => {
    expect(procuraEmprego("")).toBe(false);
    expect(procuraEmprego(null)).toBe(false);
  });
});

describe("respostaParaCandidato", () => {
  it("usa o primeiro nome e manda para o RH", () => {
    const r = respostaParaCandidato("Eduardo Lima");
    expect(r.startsWith("Oi Eduardo!")).toBe(true);
    expect(r).toContain(EMAIL_DE_RH);
  });

  it("funciona sem nome", () => {
    expect(respostaParaCandidato(null).startsWith("Oi!")).toBe(true);
  });

  it("não promete retorno que a gente não vai dar", () => {
    const r = respostaParaCandidato("Ana");
    expect(r.toLowerCase()).not.toContain("entraremos em contato");
    expect(r.toLowerCase()).not.toContain("retornamos");
  });
});
