import { describe, expect, it } from "vitest";
import { chaveDoNome, pareceFiliais, sugerirNomeDaMae } from "./empresas-parecidas";

describe("pareceFiliais", () => {
  it("unidades com código/UF são filiais", () => {
    expect(
      pareceFiliais(["Sicredi Sul SC - 2604", "Sicredi Norte SC - 2602"], "Mesmo domínio"),
    ).toBe(true);
    expect(
      pareceFiliais(
        ["Grupo Gerdau S/A - Charqueadas", "Grupo Gerdau S/A - São Paulo"],
        "Nome parecido",
      ),
    ).toBe(true);
  });

  it("mesmo nome é cadastro duplicado, não filial", () => {
    expect(
      pareceFiliais(["Transportes Cavalinho", "Transportes Cavalinho Ltda"], "Mesmo domínio"),
    ).toBe(false);
    expect(pareceFiliais(["Grupo Marciano", "Grupo Marciano"], "Nome parecido")).toBe(false);
  });

  it("chave ignora sufixo e pontuação", () => {
    expect(chaveDoNome("Móveis Andreatta LTDA.")).toBe("moveis andreatta");
  });
});

describe("sugerirNomeDaMae", () => {
  it("usa as palavras iniciais comuns", () => {
    expect(sugerirNomeDaMae(["Sicredi Sul SC - 2604", "Sicredi Norte SC - 2602"])).toBe("Sicredi");
    expect(
      sugerirNomeDaMae(["Grupo Gerdau S/A - Charqueadas", "Grupo Gerdau S/A - São Paulo"]),
    ).toBe("Grupo Gerdau S/A");
    expect(sugerirNomeDaMae(["Acme", "Beta"])).toBe("");
  });
});
