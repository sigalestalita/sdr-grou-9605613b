import { describe, expect, it } from "vitest";
import { agrupar, normalizarUF, regiaoDaUF, type LinhaBase } from "./segmentos";

describe("estado em texto livre → UF", () => {
  it.each([
    ["SP", "SP"],
    ["sp", "SP"],
    ["São Paulo", "SP"],
    ["sao paulo - SP", "SP"],
    ["Rio Grande do Sul", "RS"],
    ["Mato Grosso do Sul", "MS"],
    ["Mato Grosso", "MT"],
    ["Curitiba/PR", "PR"],
    ["Pará", "PA"],
    ["Paraná", "PR"],
    ["Paraíba", "PB"],
    ["", null],
    ["Exterior", null],
  ])("%s → %s", (txt, uf) => {
    expect(normalizarUF(txt)).toBe(uf);
  });
  it("região", () => {
    expect(regiaoDaUF("SP")).toBe("Sudeste");
    expect(regiaoDaUF("RS")).toBe("Sul");
    expect(regiaoDaUF(null)).toBeNull();
  });
});

const linha = (o: Partial<LinhaBase>): LinhaBase => ({
  porte: null,
  tipoVenda: null,
  statusCliente: null,
  cidade: null,
  estado: null,
  executivo: null,
  partes: [],
  ...o,
});

describe("agrupar", () => {
  const linhas = [
    linha({
      estado: "São Paulo",
      porte: "grande",
      tipoVenda: "Cliente novo",
      partes: [
        { marca: "PDA", tipo: "produto", valor: 9702 },
        { marca: "PDA", tipo: "servico", valor: 1758 },
      ],
    }),
    linha({
      estado: "RJ",
      porte: "grande",
      tipoVenda: "Up-sell / recompra",
      partes: [{ marca: "Talogy", tipo: "produto", valor: 398 }],
    }),
    linha({ estado: "Porto Alegre - RS", partes: [{ marca: null, tipo: null, valor: 100 }] }),
  ];
  it("por região soma o negócio inteiro", () => {
    expect(agrupar(linhas, "regiao")).toEqual([
      { chave: "Sudeste", negocios: 2, valor: 11858, produto: 10100, servico: 1758 },
      { chave: "Sul", negocios: 1, valor: 100, produto: 0, servico: 0 },
    ]);
  });
  it("produto PDA × serviço divide o negócio pelas partes", () => {
    const g = agrupar(linhas, "produto_servico");
    expect(g.map((x) => [x.chave, x.valor])).toEqual([
      ["Produto PDA", 9702],
      ["Serviço", 1758],
      ["Produto Talogy", 398],
      ["Sem tipo", 100],
    ]);
  });
  it("tipo novo × recompra e porte não informado", () => {
    expect(agrupar(linhas, "tipo_venda").map((x) => x.chave)).toEqual([
      "Cliente novo",
      "Recompra / carteira",
      "Não informado",
    ]);
    expect(agrupar(linhas, "porte").map((x) => x.chave)).toEqual(["Grande", "Não informado"]);
  });
});
