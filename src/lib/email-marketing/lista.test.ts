import { describe, expect, it } from "vitest";
import { lerListaDeEmails, limparEmail } from "./lista";

describe("limparEmail", () => {
  it("normaliza e rejeita o que não é e-mail", () => {
    expect(limparEmail("  Ana.Souza@Empresa.com.BR ")).toBe("ana.souza@empresa.com.br");
    expect(limparEmail("Ana <ana@x.com>")).toBe("ana@x.com");
    expect(limparEmail("mailto:ana@x.com;")).toBe("ana@x.com");
    expect(limparEmail("ana@x")).toBeNull();
    expect(limparEmail("Nome")).toBeNull();
  });
});

describe("lerListaDeEmails", () => {
  it("colado de planilha com cabeçalho (tab), em qualquer ordem de colunas", () => {
    const r = lerListaDeEmails(
      "Empresa\tNome\tE-mail\nPlaenge\tBruna Neves\tB.Neves@plaenge.com.br\nSSI\tCris\tcris@ssi.com.br\n",
    );
    expect(r.contatos).toEqual([
      { email: "b.neves@plaenge.com.br", nome: "Bruna Neves", empresa: "Plaenge" },
      { email: "cris@ssi.com.br", nome: "Cris", empresa: "SSI" },
    ]);
    expect(r.invalidas).toEqual([]);
  });

  it("CSV com ponto e vírgula e aspas", () => {
    const r = lerListaDeEmails('nome;email;empresa\n"Souza; Ana";ana@x.com;"Acme, SA"');
    expect(r.contatos).toEqual([{ email: "ana@x.com", nome: "Souza; Ana", empresa: "Acme, SA" }]);
  });

  it("só e-mails, um por linha, com repetidos e linhas inválidas", () => {
    const r = lerListaDeEmails("a@x.com\nA@X.com\nsem email aqui\n\nb@y.com.br");
    expect(r.contatos.map((c) => c.email)).toEqual(["a@x.com", "b@y.com.br"]);
    expect(r.repetidos).toBe(1);
    expect(r.invalidas).toEqual(["sem email aqui"]);
  });

  it("sem cabeçalho: e-mail em qualquer coluna, as outras viram nome e empresa", () => {
    const r = lerListaDeEmails("Maria,maria@z.com,Zeta\n");
    expect(r.contatos).toEqual([{ email: "maria@z.com", nome: "Maria", empresa: "Zeta" }]);
  });

  it("vazio", () => {
    expect(lerListaDeEmails("  \n ")).toEqual({ contatos: [], invalidas: [], repetidos: 0 });
  });
});
