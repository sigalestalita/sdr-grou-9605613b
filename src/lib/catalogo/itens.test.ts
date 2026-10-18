import { describe, expect, it } from "vitest";
import { dividirNegocio, proposta, somarDivisoes, totalItens, type ItemNegocio } from "./itens";

const item = (tipo: ItemNegocio["tipo"], quantidade: number, valor_unitario: number) => ({
  product_id: null,
  nome: "x",
  tipo,
  quantidade,
  valor_unitario,
});

describe("divisão produto × serviço", () => {
  it("licença + certificação entra metade em cada meta", () => {
    const d = dividirNegocio(0, [item("produto", 1, 9702), item("servico", 3, 1758)]);
    expect(d).toEqual({ produto: 9702, servico: 5274, semTipo: 0, total: 14976 });
  });
  it("sem itens, o valor todo fica sem tipo", () => {
    expect(dividirNegocio(4500, [])).toEqual({
      produto: 0,
      servico: 0,
      semTipo: 4500,
      total: 4500,
    });
  });
  it("item sem classificação fica separado", () => {
    expect(dividirNegocio(0, [item(null, 2, 100.005)]).semTipo).toBe(200.01);
  });
  it("soma divisões e totaliza itens em centavos", () => {
    const s = somarDivisoes([
      dividirNegocio(0, [item("produto", 1, 0.1)]),
      dividirNegocio(0, [item("produto", 1, 0.2)]),
    ]);
    expect(s.produto).toBe(0.3);
    expect(totalItens([item("produto", 3, 0.1)])).toBe(0.3);
  });
});

describe("proposta", () => {
  it("total → impostos → final, sem imposto negativo nem maior que o total", () => {
    expect(proposta(10000, 350)).toEqual({ total: 10000, impostos: 350, final: 9650 });
    expect(proposta(100, -5).impostos).toBe(0);
    expect(proposta(100, 500).final).toBe(0);
    expect(proposta(100, null).final).toBe(100);
  });
});
