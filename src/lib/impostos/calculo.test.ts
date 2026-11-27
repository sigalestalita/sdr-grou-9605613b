import { describe, expect, it } from "vitest";
import {
  brutoParaLiquido,
  fatorParaLiquido,
  calcular,
  calcularItem,
  ehPortoAlegre,
  regimeDaReceita,
  tipoPessoaDoDocumento,
  type Cliente,
  type RegraImposto,
  REGRAS_PADRAO,
  simular,
} from "./calculo";

const cnpj = (regime: Cliente["regime"], extra: Partial<Cliente> = {}): Cliente => ({
  tipoPessoa: "CNPJ",
  regime,
  municipio: "Caxias do Sul",
  categoriaEspecialIss: false,
  ...extra,
});
const t = (bruto: number) => ({ nome: "Workshop", classificacao: "treinamento" as const, bruto });

describe("conferências da calculadora original", () => {
  it("bruto 1.000, Lucro Presumido, treinamento, POA categoria especial → 111,50", () => {
    const r = calcularItem(
      t(1000),
      cnpj("Lucro Presumido", { municipio: "PORTO ALEGRE", categoriaEspecialIss: true }),
    );
    expect(r.impostos.map((l) => [l.imposto, l.valor])).toEqual([
      ["PIS", 6.5],
      ["COFINS", 30],
      ["CSLL", 10],
      ["IRRF", 15],
      ["ISS", 50],
    ]);
    expect(r.total).toBe(111.5);
    expect(r.liquido).toBe(888.5);
  });

  it("líquido 1.000, Simples, treinamento → bruto 1.015,23", () => {
    expect(brutoParaLiquido(1000, "treinamento", cnpj("Simples Nacional"))).toBe(1015.23);
  });

  it("líquido 640, Lucro Real → re-enquadra na faixa de cima: 681,94", () => {
    expect(brutoParaLiquido(640, "treinamento", cnpj("Lucro Real"))).toBe(681.94);
  });
});

describe("faixas e regimes (treinamento)", () => {
  it("faixas de valor sem buraco", () => {
    expect(calcularItem(t(215.05), cnpj("Lucro Presumido")).total).toBe(0);
    expect(calcularItem(t(500), cnpj("Lucro Presumido")).total).toBe(23.25);
    expect(calcularItem(t(666.66), cnpj("Lucro Presumido")).impostos).toHaveLength(3);
    expect(calcularItem(t(666.665), cnpj("Lucro Presumido")).impostos).toHaveLength(4);
  });
  it("Simples e MEI só IRRF; Isento 6,15% sem ISS; CPF nada", () => {
    expect(calcularItem(t(100), cnpj("MEI")).total).toBe(1.5);
    const poa = { municipio: "Porto Alegre", categoriaEspecialIss: true };
    const isento = calcularItem(t(1000), cnpj("Isento", poa));
    expect(isento.total).toBe(61.5);
    expect(isento.impostos.some((l) => l.imposto === "ISS")).toBe(false);
    const pf = calcularItem(t(1000), { tipoPessoa: "CPF", regime: null, ...poa });
    expect(pf.total).toBe(0);
  });
});

describe("licenciamento e suporte", () => {
  it("sem retenção; ISS 2% só em POA categoria especial", () => {
    const lic = { nome: "Licença", classificacao: "licenciamento" as const, bruto: 9702 };
    expect(calcularItem(lic, cnpj("Lucro Real")).total).toBe(0);
    expect(
      calcularItem(
        lic,
        cnpj("Lucro Real", { municipio: "Porto Alegre/RS", categoriaEspecialIss: true }),
      ).total,
    ).toBe(194.04);
  });
});

describe("total e auxiliares", () => {
  it("soma por imposto e marca itens sem classificação", () => {
    const r = calcular(
      [
        t(1000),
        { nome: "Licença", classificacao: "licenciamento", bruto: 3100 },
        { nome: "?", classificacao: null, bruto: 50 },
      ],
      cnpj("Lucro Presumido"),
    );
    expect(r.impostos).toBe(61.5);
    expect(r.bruto).toBe(4150);
    expect(r.porImposto.find((l) => l.imposto === "IRRF")?.valor).toBe(15);
    expect(r.semClassificacao).toBe(1);
  });
  it("documento, município e regime", () => {
    expect(tipoPessoaDoDocumento("06.934.208/0001-64")).toBe("CNPJ");
    expect(tipoPessoaDoDocumento("123.456.789-01")).toBe("CPF");
    expect(tipoPessoaDoDocumento("")).toBeNull();
    expect(ehPortoAlegre("Pôrto Alegre")).toBe(true);
    expect(ehPortoAlegre("Canoas")).toBe(false);
    expect(regimeDaReceita({ opcao_pelo_mei: true, opcao_pelo_simples: true })).toBe("MEI");
    expect(regimeDaReceita({ opcao_pelo_simples: true })).toBe("Simples Nacional");
    expect(regimeDaReceita({})).toBe("Lucro Presumido");
  });
});

describe("fatorParaLiquido", () => {
  it("acha o bruto dos itens que deixa o líquido pedido", () => {
    const c = {
      tipoPessoa: "CNPJ" as const,
      regime: "Lucro Real" as const,
      municipio: "Canoas",
      categoriaEspecialIss: false,
    };
    const itens = [
      { nome: "A", classificacao: "treinamento" as const, bruto: 600 },
      { nome: "B", classificacao: "treinamento" as const, bruto: 400 },
    ];
    const { fator, resultado } = fatorParaLiquido(itens, c, 2000);
    expect(Math.abs(resultado.liquido - 2000)).toBeLessThan(0.05);
    expect(fator).toBeGreaterThan(2);
  });
});

describe("regras editáveis e simulação", () => {
  it("regra de um produto substitui as da classificação", () => {
    const especial: RegraImposto = {
      ...REGRAS_PADRAO[0],
      id: "x",
      nome: "Pesquisa — sem retenção",
      classificacao: null,
      produtoId: "p1",
      tipoPessoa: null,
      prioridade: 50,
      itens: [],
    };
    const item = {
      nome: "Pesquisa",
      classificacao: "treinamento" as const,
      bruto: 1000,
      produtoId: "p1",
    };
    expect(calcularItem(item, cnpj("Lucro Presumido"), [...REGRAS_PADRAO, especial]).total).toBe(0);
    expect(calcularItem(item, cnpj("Lucro Presumido")).total).toBe(61.5);
  });

  it("regra desativada não vale", () => {
    const sem = REGRAS_PADRAO.map((r) => (r.id === "trein-acima-666" ? { ...r, ativo: false } : r));
    expect(calcularItem(t(1000), cnpj("Lucro Presumido"), sem).total).toBe(0);
  });

  it("desconto e comissão saem do líquido; modo líquido acha o bruto", () => {
    const b = simular([t(1000)], cnpj("Simples Nacional"), {
      modo: "bruto",
      desconto: 50,
      comissaoPct: 10,
    });
    expect(b.liquidoFinal).toBe(1000 - 15 - 50 - 100);
    const l = simular([t(500)], cnpj("Simples Nacional"), {
      modo: "liquido",
      liquidoAlvo: 835,
      desconto: 50,
      comissaoPct: 10,
    });
    expect(Math.abs(l.liquidoFinal - 835)).toBeLessThan(0.02);
    expect(l.bruto).toBeCloseTo(1000, 0);
  });
});
