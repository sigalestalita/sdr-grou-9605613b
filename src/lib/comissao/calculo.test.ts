import { describe, expect, it } from "vitest";
import {
  atingimento,
  calcularComissao,
  fatorDaFaixa,
  realizadoDasLinhas,
  REGRA_PADRAO,
  trimestre,
} from "./calculo";

describe("faixas da planilha", () => {
  const f = REGRA_PADRAO.faixas;
  it.each([
    [0, 0],
    [49.99, 0],
    [50, 20],
    [59.99, 20],
    [60, 30],
    [75, 40],
    [89.99, 50],
    [90, 80],
    [99.99, 80],
    [100, 100],
    [130, 100],
  ])("%s%% → fator %s%%", (pct, fator) => {
    expect(fatorDaFaixa(pct, f)).toBe(fator);
  });
  it("49,996% arredonda para 50% (a planilha compara com 49,995%)", () => {
    expect(atingimento(49996, 100000)).toBe(50);
    expect(fatorDaFaixa(atingimento(49996, 100000), f)).toBe(20);
  });
  it("sem meta, atingimento zero", () => {
    expect(atingimento(1000, 0)).toBe(0);
  });
});

describe("comissão", () => {
  it("produto e serviço calculados separados, base 5% da meta", () => {
    // meta produto 100 mil, fez 85 mil (85% → 50% da base de 5 mil = 2.500)
    // meta serviço 40 mil, fez 40 mil (100% → base inteira = 2.000)
    const r = calcularComissao({
      metaProduto: 100000,
      metaServico: 40000,
      realizadoProduto: 85000,
      realizadoServico: 40000,
    });
    expect(r.produto.base).toBe(5000);
    expect(r.produto.comissao).toBe(2500);
    expect(r.servico.comissao).toBe(2000);
    expect(r.comissao).toBe(4500);
    expect(r.total).toBe(4500);
  });
  it("super meta só acima de 100% e, como na planilha, fora do total", () => {
    const r = calcularComissao({
      metaProduto: 100000,
      metaServico: 0,
      realizadoProduto: 120000,
      realizadoServico: 0,
    });
    // base 5.000 × 20% acima da meta = 1.000
    expect(r.superMeta).toBe(1000);
    expect(r.total).toBe(5000);
    const somando = calcularComissao(
      { metaProduto: 100000, metaServico: 0, realizadoProduto: 120000, realizadoServico: 0 },
      { ...REGRA_PADRAO, super_meta_soma: true },
    );
    expect(somando.total).toBe(6000);
  });
  it("abaixo da meta a super meta não fica negativa (na planilha ficava)", () => {
    const r = calcularComissao({
      metaProduto: 100000,
      metaServico: 50000,
      realizadoProduto: 40000,
      realizadoServico: 10000,
    });
    expect(r.superMeta).toBe(0);
    expect(r.total).toBe(0);
  });
});

describe("realizado pelas linhas conferidas", () => {
  it("PDA + Talogy por tipo; Self Guru e sem tipo à parte; excluída não conta", () => {
    expect(
      realizadoDasLinhas([
        { marca: "PDA", tipo: "produto", valor_considerado: 9702, excluida: false },
        { marca: "Talogy", tipo: "produto", valor_considerado: 398, excluida: false },
        { marca: "PDA", tipo: "servico", valor_considerado: 1758, excluida: false },
        { marca: "Self Guru", tipo: "servico", valor_considerado: 5688, excluida: false },
        { marca: null, tipo: null, valor_considerado: 100, excluida: false },
        { marca: "PDA", tipo: "produto", valor_considerado: 999, excluida: true },
      ]),
    ).toEqual({ produto: 10100, servico: 1758, selfGuru: 5688, semTipo: 100 });
  });
  it("trimestres", () => {
    expect([1, 3, 4, 6, 7, 12].map(trimestre)).toEqual([1, 1, 2, 2, 3, 4]);
  });
});
