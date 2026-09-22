import { describe, expect, it } from "vitest";
import { ehMensagemDeConversao, escreveuDeVerdade } from "./mensagem-de-conversao";

const doFormulario = `Olá! Preenchi seu formulário e gostaria de saber mais sobre sua empresa.

First name: Rosangela
Last name: Razevedo
Phone number: +5592991289406
Work email: Razevedo-manauto@uol.com.br
Company name: Manauto
Qual o seu cargo atual?: Gerente/Coordenador`;

describe("ehMensagemDeConversao", () => {
  it("reconhece o texto pronto do formulário", () => {
    expect(ehMensagemDeConversao(doFormulario)).toBe(true);
  });

  it("reconhece o texto pronto do clique no anúncio", () => {
    expect(
      ehMensagemDeConversao("Olá! Quero mais informações sobre licença PDA da Black September."),
    ).toBe(true);
  });

  it("não confunde com mensagem que a pessoa digitou", () => {
    expect(ehMensagemDeConversao("Oie")).toBe(false);
    expect(ehMensagemDeConversao("Bom dia! Queria saber o valor da licença")).toBe(false);
    expect(ehMensagemDeConversao("quero saber mais sobre o preço")).toBe(false);
  });

  it("aguenta vazio", () => {
    expect(ehMensagemDeConversao("")).toBe(false);
    expect(ehMensagemDeConversao(null)).toBe(false);
  });
});

describe("escreveuDeVerdade", () => {
  it("só o texto da conversão não conta como conversa começada", () => {
    expect(escreveuDeVerdade([doFormulario])).toBe(false);
  });

  it("qualquer coisa digitada depois conta", () => {
    expect(escreveuDeVerdade([doFormulario, "Oie"])).toBe(true);
  });

  it("conversa vazia não conta", () => {
    expect(escreveuDeVerdade([])).toBe(false);
    expect(escreveuDeVerdade(["   ", null])).toBe(false);
  });
});
