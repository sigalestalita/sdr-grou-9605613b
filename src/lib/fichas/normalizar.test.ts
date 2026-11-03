import { describe, expect, it } from "vitest";
import { formatarDocumento, mesmoNome, normalizarFicha } from "./normalizar";

describe("normalizarFicha", () => {
  it("PJ: documento só dígitos e rádios com rótulo", () => {
    const f = normalizarFicha({
      id: "abc",
      razao_social: " ACME LTDA ",
      nome_fantasia: "Acme",
      cnpj: "06.934.208/0001-64",
      regime_tributario: "presumido",
      contribuinte_icms: "nao-contribuinte",
      forma_pagamento: "boleto",
      ordem_compra_obrigatoria: "sim",
      contato_email: "RH@Acme.com",
      vendedor_responsavel: "Taís Oliari",
      estado: "rs",
      created_at: "2026-10-30T12:00:00Z",
    });
    expect(f).toMatchObject({
      externoId: "abc",
      tipo: "CNPJ",
      documento: "06934208000164",
      nome: "ACME LTDA",
      email: "rh@acme.com",
      estado: "RS",
      enviadaEm: "2026-10-30T12:00:00Z",
    });
    expect(f.dados.regime_tributario).toBe("Lucro Presumido");
    expect(f.dados.contribuinte_icms).toBe("Não contribuinte");
    expect(f.dados.forma_pagamento).toBe("Boleto");
    expect(f.dados.ordem_compra_obrigatoria).toBe("Sim");
  });

  it("PF: nome completo, CPF e sem o cargo fixo", () => {
    const f = normalizarFicha({
      client_type: "CPF",
      nome_completo: "Ana Souza",
      cpf: "123.456.789-01",
      contato_cargo: "Cliente",
      forma_pagamento: "Cartão de Crédito",
      ordem_compra_obrigatoria: "Não",
    });
    expect(f.tipo).toBe("CPF");
    expect(f.documento).toBe("12345678901");
    expect(f.nome).toBe("Ana Souza");
    expect(f.dados.contato_cargo).toBeUndefined();
    expect(f.dados.forma_pagamento).toBe("Cartão de Crédito");
    expect(f.dados.ordem_compra_obrigatoria).toBe("Não");
  });

  it("formata documento e compara nomes", () => {
    expect(formatarDocumento("06934208000164")).toBe("06.934.208/0001-64");
    expect(formatarDocumento("12345678901")).toBe("123.456.789-01");
    expect(mesmoNome("Taís Oliari", "tais  oliari")).toBe(true);
    expect(mesmoNome("Mariana Borges", "Mariana Uebel")).toBe(false);
  });
});

describe("CSV do painel", () => {
  it("lê aspas, BOM e a linha Todos", async () => {
    const { lerCsv, fichaDoCsv } = await import("./normalizar");
    const csv =
      "﻿Tipo,Razão Social / Nome,Nome Completo,CNPJ,CPF,Vendedor Responsável,Email,Telefone,WhatsApp,Cidade,Estado,Status,Data de Cadastro\r\n" +
      'CNPJ,"ACME, LTDA",,37.237.196/0001-42,,Mariana Borges,X@Y.com,1,2,Blumenau,sc,Enviado,31/10/2026\r\n' +
      "CPF,,Ana,,747.731.602-25,Maicon,,,,,,Enviado,26/10/2026\r\n";
    const linhas = lerCsv(csv);
    expect(linhas).toHaveLength(2);
    const a = fichaDoCsv(linhas[0])!;
    expect(a).toMatchObject({
      tipo: "CNPJ",
      documento: "37237196000142",
      nome: "ACME, LTDA",
      email: "x@y.com",
      estado: "SC",
    });
    expect(a.enviadaEm).toBe("2026-10-31T12:00:00-03:00");
    expect(fichaDoCsv(linhas[1])).toMatchObject({
      tipo: "CPF",
      documento: "74773160225",
      nome: "Ana",
    });
  });
});
