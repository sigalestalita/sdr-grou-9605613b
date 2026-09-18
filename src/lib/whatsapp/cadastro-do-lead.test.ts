import { describe, expect, it } from "vitest";
import { cadastroCompleto, camposQueFaltam, instrucaoDeCadastro } from "./cadastro-do-lead";

const vazio = {};
const completo = {
  lead_type: "empresa",
  company_name: "Useall",
  position: "Gerente",
  company_size: "101 - 200",
  email: "renata@useall.com.br",
};

describe("camposQueFaltam", () => {
  it("pede tudo quando o lead chega só com telefone", () => {
    expect(camposQueFaltam(vazio).map((d) => d.campo)).toEqual([
      "lead_type",
      "company_name",
      "position",
      "company_size",
      "email",
    ]);
  });

  it("não pede o que já está preenchido", () => {
    expect(camposQueFaltam({ ...vazio, lead_type: "consultoria" }).map((d) => d.campo)).toEqual([
      "company_name",
      "position",
      "company_size",
      "email",
    ]);
  });

  it("trata string em branco como ausente", () => {
    expect(camposQueFaltam({ ...completo, email: "   " }).map((d) => d.campo)).toEqual(["email"]);
  });

  it("reconhece o cadastro fechado", () => {
    expect(cadastroCompleto(completo)).toBe(true);
    expect(cadastroCompleto(vazio)).toBe(false);
  });
});

describe("instrucaoDeCadastro", () => {
  it("manda perguntar um dado por vez, na ordem", () => {
    const i = instrucaoDeCadastro({ lead_type: "empresa" });
    expect(i).toContain("nome da empresa");
    expect(i).toContain("Faça uma pergunta só");
    expect(i).toContain("Não faça pergunta de diagnóstico");
  });

  it("anuncia qual é o próximo depois do atual", () => {
    expect(instrucaoDeCadastro({ lead_type: "empresa", company_name: "Useall" })).toContain(
      "o próximo dado a perguntar é porte",
    );
  });

  it("some quando não falta nada", () => {
    expect(instrucaoDeCadastro(completo)).toBe("");
  });

  it("no último dado, avisa que o cadastro fecha", () => {
    expect(instrucaoDeCadastro({ ...completo, email: null })).toContain("o cadastro fecha");
  });
});
