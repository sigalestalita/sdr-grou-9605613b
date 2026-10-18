import { describe, expect, it } from "vitest";
import {
  calcularRetencoes,
  cnpjRaiz,
  cnpjValido,
  conferirGanho,
  dentroDaJanela,
  formatarCnpj,
  gerarParcelas,
  primeiroVencimento,
  proximaEmissao,
  resolverPolitica,
  resumoPolitica,
  type DadosGanho,
} from "./politica";

const GANHO_OK: DadosGanho = {
  ocSituacao: "numero",
  ocNumero: "OC-1",
  ocAnexoUrl: null,
  cnpjFaturamento: "11.222.333/0001-81",
  emissaoPrevistaEm: "2026-10-10",
  parcelas: 1,
  valor: 1000,
  contatoFaturamento: true,
  clienteNovo: false,
};

describe("CNPJ", () => {
  it("valida dígitos verificadores", () => {
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
    expect(cnpjValido("11222333000182")).toBe(false);
    expect(cnpjValido("00000000000000")).toBe(false);
    expect(cnpjValido("123")).toBe(false);
  });
  it("formata e tira a raiz", () => {
    expect(formatarCnpj("11222333000181")).toBe("11.222.333/0001-81");
    expect(cnpjRaiz("11.222.333/0001-81")).toBe("11222333");
    expect(cnpjRaiz("")).toBeNull();
  });
});

describe("política com herança", () => {
  it("filial herda da matriz só o que não definiu", () => {
    const p = resolverPolitica(
      { exige_oc: false, codigo_webmais: "WM-9" },
      { exige_oc: true, prazo_tipo: "dias_apos_emissao", prazo_valor: 15, codigo_webmais: "WM-1" },
    );
    expect(p.exige_oc).toBe(false);
    expect(p.prazo_valor).toBe(15);
    expect(p.herdados).toEqual(["prazo_tipo", "prazo_valor"]);
    // código WebMais é do CNPJ, não se herda
    expect(p.codigo_webmais).toBe("WM-9");
    expect(p.definida).toBe(true);
  });
  it("sem nada definido", () => {
    expect(resolverPolitica(null, null).definida).toBe(false);
  });
  it("resume em frases curtas, com retenções vindas como string do banco", () => {
    const p = resolverPolitica({
      exige_oc: true,
      janela_emissao_inicio: 1,
      janela_emissao_fim: 20,
      prazo_tipo: "dias_apos_emissao",
      prazo_valor: 15,
      aceita_parcelamento: false,
      retencao_iss: "2.00" as unknown as number,
    });
    expect(resumoPolitica(p)).toEqual([
      "Exige ordem de compra",
      "Nota só do dia 1 ao 20",
      "Paga 15 dias após a emissão",
      "Não parcela",
      "Retém ISS 2%",
    ]);
  });
});

describe("datas", () => {
  it("janela normal e janela que vira o mês", () => {
    expect(dentroDaJanela("2026-10-10", 1, 20)).toBe(true);
    expect(dentroDaJanela("2026-10-25", 1, 20)).toBe(false);
    expect(dentroDaJanela("2026-10-28", 25, 5)).toBe(true);
    expect(dentroDaJanela("2026-10-03", 25, 5)).toBe(true);
    expect(dentroDaJanela("2026-10-10", 25, 5)).toBe(false);
    expect(dentroDaJanela("2026-10-10", null, null)).toBe(true);
  });
  it("próxima emissão possível", () => {
    expect(proximaEmissao("2026-10-25", 1, 20)).toBe("2026-11-01");
    expect(proximaEmissao("2026-10-10", 25, 5)).toBe("2026-10-25");
    expect(proximaEmissao("2026-10-12", 1, 20)).toBe("2026-10-12");
  });
  it("vencimento pela regra do cliente", () => {
    expect(
      primeiroVencimento("2026-10-20", { prazo_tipo: "dias_apos_emissao", prazo_valor: 15 }),
    ).toBe("2026-11-04");
    expect(primeiroVencimento("2026-10-20", { prazo_tipo: "dia_fixo", prazo_valor: 30 })).toBe(
      "2026-10-30",
    );
    expect(primeiroVencimento("2026-10-31", { prazo_tipo: "dia_fixo", prazo_valor: 30 })).toBe(
      "2026-11-30",
    );
    // fevereiro não tem dia 30: cai no último dia
    expect(primeiroVencimento("2027-02-01", { prazo_tipo: "dia_fixo", prazo_valor: 30 })).toBe(
      "2027-02-28",
    );
    expect(primeiroVencimento("2026-10-20", { prazo_tipo: "a_vista", prazo_valor: null })).toBe(
      "2026-10-20",
    );
  });
  it("parcelas mensais com os centavos na última", () => {
    const p = gerarParcelas(1000, 3, "2026-01-31");
    expect(p.map((x) => x.vencimento)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
    expect(p.map((x) => x.valor)).toEqual([333.33, 333.33, 333.34]);
    expect(p.reduce((s, x) => s + x.valor, 0)).toBeCloseTo(1000, 2);
  });
});

describe("retenções", () => {
  it("calcula líquido", () => {
    const r = calcularRetencoes(10000, {
      retencao_iss: 2,
      retencao_irrf: 1.5,
      retencao_pis: null,
      retencao_cofins: null,
      retencao_csll: null,
      retencao_inss: null,
    });
    expect(r.total).toBe(350);
    expect(r.liquido).toBe(9650);
    expect(r.itens.map((i) => i.rotulo)).toEqual(["ISS", "IRRF"]);
  });
});

describe("conferência do ganho", () => {
  const exige = resolverPolitica({ exige_oc: true, aceita_parcelamento: false });

  it("ganho completo não tem pendência", () => {
    expect(conferirGanho(GANHO_OK, resolverPolitica(null))).toEqual([]);
  });
  it("cliente que exige OC bloqueia o 'não tem'", () => {
    const p = conferirGanho({ ...GANHO_OK, ocSituacao: "nao_tem", ocNumero: null }, exige);
    expect(p.find((x) => x.campo === "oc")?.bloqueia).toBe(true);
  });
  it("sem exigência, 'não tem' passa", () => {
    const p = conferirGanho(
      { ...GANHO_OK, ocSituacao: "nao_tem", ocNumero: null },
      resolverPolitica(null),
    );
    expect(p).toEqual([]);
  });
  it("parcelado para quem só paga à vista bloqueia", () => {
    expect(conferirGanho({ ...GANHO_OK, parcelas: 3 }, exige).some((x) => x.bloqueia)).toBe(true);
  });
  it("CNPJ inválido bloqueia; ausente só avisa", () => {
    const sem = conferirGanho({ ...GANHO_OK, cnpjFaturamento: null }, resolverPolitica(null));
    expect(sem).toEqual([expect.objectContaining({ campo: "cnpj", bloqueia: false })]);
    const inv = conferirGanho({ ...GANHO_OK, cnpjFaturamento: "11222333000100" }, exige);
    expect(inv.find((x) => x.campo === "cnpj")?.bloqueia).toBe(true);
  });
  it("emissão fora da janela sugere a próxima data", () => {
    const p = conferirGanho(
      { ...GANHO_OK, emissaoPrevistaEm: "2026-10-25" },
      resolverPolitica({ janela_emissao_inicio: 1, janela_emissao_fim: 20 }),
    );
    expect(p[0].mensagem).toContain("2026-11-01");
    expect(p[0].bloqueia).toBe(false);
  });
  it("cliente novo sem ficha avisa", () => {
    const p = conferirGanho({ ...GANHO_OK, clienteNovo: true }, resolverPolitica(null));
    expect(p.map((x) => x.campo)).toEqual(["ficha"]);
  });
});
