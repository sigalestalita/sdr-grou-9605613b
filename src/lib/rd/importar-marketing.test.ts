import { describe, expect, it } from "vitest";
import {
  acharColuna,
  dominioCorporativo,
  lerExportDeMarketing,
  nomeNormalizado,
} from "./importar-marketing";

describe("acharColuna", () => {
  const cabecalhos = ["Nome", "E-mail", "Telefone celular", "Última conversão", "Empresa"];

  it("acha ignorando acento e caixa", () => {
    expect(acharColuna(cabecalhos, ["email", "e-mail"])).toBe("E-mail");
    expect(acharColuna(cabecalhos, ["última conversão"])).toBe("Última conversão");
  });

  it("acha por prefixo quando o RD detalha o rótulo", () => {
    expect(acharColuna(cabecalhos, ["telefone"])).toBe("Telefone celular");
  });

  it("devolve nulo quando a coluna não veio no export", () => {
    expect(acharColuna(cabecalhos, ["cargo"])).toBeNull();
  });
});

describe("lerExportDeMarketing", () => {
  it("lê o export e normaliza o e-mail", () => {
    const { leads } = lerExportDeMarketing([
      { Nome: "Ana Paula", "E-mail": "Ana@Empresa.COM.BR", Empresa: "Indústria" },
    ]);
    expect(leads).toHaveLength(1);
    expect(leads[0].email).toBe("ana@empresa.com.br");
    expect(leads[0].nome).toBe("Ana Paula");
  });

  it("descarta quem não tem e-mail nem telefone", () => {
    // Sem os dois não dá para casar com nada nem falar com ninguém.
    const r = lerExportDeMarketing([
      { Nome: "Sem contato", "E-mail": "", Telefone: "" },
      { Nome: "Com email", "E-mail": "x@y.com", Telefone: "" },
    ]);
    expect(r.leads).toHaveLength(1);
    expect(r.ignoradas).toBe(1);
  });

  it("trata o traço do RD como vazio", () => {
    const { leads } = lerExportDeMarketing([{ "E-mail": "a@b.com", Empresa: "-", Cargo: "-" }]);
    expect(leads[0].empresa).toBeNull();
  });

  it("lê a contagem de conversões como número", () => {
    const { leads } = lerExportDeMarketing([{ "E-mail": "a@b.com", Conversões: "28" }]);
    expect(leads[0].conversoes).toBe(28);
  });

  it("não quebra com export vazio", () => {
    expect(lerExportDeMarketing([])).toEqual({ leads: [], ignoradas: 0 });
  });
});

describe("dominioCorporativo", () => {
  it("devolve o domínio de e-mail corporativo", () => {
    expect(dominioCorporativo("ana@industriaexemplo.com.br")).toBe("industriaexemplo.com.br");
  });

  it("ignora provedor pessoal", () => {
    // Ligar por "gmail.com" juntaria milhares de pessoas numa empresa só.
    for (const e of ["a@gmail.com", "b@hotmail.com", "c@uol.com.br", "d@icloud.com"]) {
      expect({ [e]: dominioCorporativo(e) }).toEqual({ [e]: null });
    }
  });

  it("devolve nulo para lixo", () => {
    expect(dominioCorporativo("")).toBeNull();
    expect(dominioCorporativo("sem-arroba")).toBeNull();
    expect(dominioCorporativo("@semlocal.com")).toBeNull();
  });
});

describe("nomeNormalizado", () => {
  it("bate com a normalização da coluna gerada", () => {
    expect(nomeNormalizado("Indústria Exemplo S/A")).toBe("ind stria exemplo s a");
    expect(nomeNormalizado("  ACME  LTDA. ")).toBe("acme ltda");
  });

  it("descarta nome curto demais, que casaria com qualquer coisa", () => {
    expect(nomeNormalizado("RH")).toBeNull();
    expect(nomeNormalizado("-")).toBeNull();
  });
});
