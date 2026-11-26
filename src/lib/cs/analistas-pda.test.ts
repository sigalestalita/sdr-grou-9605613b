import { describe, expect, it } from "vitest";
import { dataIso, lerAnalistasPda } from "./analistas-pda";

describe("dataIso", () => {
  it("entende dd/mm/aaaa, aaaa-mm-dd e ano curto", () => {
    expect(dataIso("10/03/2025")).toBe("2025-03-10");
    expect(dataIso("2025-3-1")).toBe("2025-03-01");
    expect(dataIso("01-12-24")).toBe("2024-12-01");
    expect(dataIso("março")).toBeNull();
    expect(dataIso("31/13/2025")).toBeNull();
  });
});

describe("lerAnalistasPda", () => {
  it("acha as colunas pelo cabeçalho e guarda o resto em dados", () => {
    const r = lerAnalistasPda(
      "Nome;E-mail;Empresa;CNPJ;Data de certificação;Turma\n" +
        "Ana Souza;Ana@Acme.com.br;Acme Ltda;12.345.678/0001-90;10/03/2025;T12\n" +
        "Bruno;bruno@x.com;;;;\n",
    );
    expect(r.analistas).toHaveLength(2);
    expect(r.analistas[0]).toMatchObject({
      nome: "Ana Souza",
      email: "ana@acme.com.br",
      empresa: "Acme Ltda",
      cnpj: "12345678000190",
      certificado_em: "2025-03-10",
      dados: { Turma: "T12" },
    });
    expect(r.colunas.certificado_em).toBe("Data de certificação");
  });

  it("colado da planilha (tab), repetidos pelo e-mail e linha sem nome", () => {
    const r = lerAnalistasPda(
      "nome\temail\tcelular\nAna\tana@a.com\t51 9999\nAna B\tANA@a.com\t\n\t\t\n",
    );
    expect(r.analistas.map((a) => a.email)).toEqual(["ana@a.com"]);
    expect(r.analistas[0].telefone).toBe("51 9999");
    expect(r.repetidos).toBe(1);
  });

  it("sem coluna de nome nem de e-mail, nada", () => {
    expect(lerAnalistasPda("x;y\n1;2").analistas).toEqual([]);
  });
});
