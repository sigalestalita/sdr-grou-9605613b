import { describe, expect, it } from "vitest";
import {
  ISENTAS_NA_JANELA,
  emReais,
  type ModeloDeCobranca,
  type VolumeDoMes,
  compararModelos,
  custoDoMes,
  semPrecoConfigurado,
  zeradoPorCategoria,
} from "./custos";

const volume: VolumeDoMes = {
  mes: "2026-09",
  enviadosPorCategoria: { ...zeradoPorCategoria(), marketing: 1000, utility: 200 },
  gratuitosNaJanela: { ...zeradoPorCategoria(), utility: 340 },
  conversasPorCategoria: { ...zeradoPorCategoria(), marketing: 400, utility: 150 },
  respostasLivres: 900,
  recebidas: 1200,
};

const porMensagem: ModeloDeCobranca = {
  id: "atual",
  nome: "Por mensagem",
  unidade: "mensagem",
  vigenteDe: null,
  precos: { ...zeradoPorCategoria(), marketing: 0.1, utility: 0.02 },
};

const porConversa: ModeloDeCobranca = {
  id: "antigo",
  nome: "Por conversa",
  unidade: "conversa",
  vigenteDe: null,
  precos: { ...zeradoPorCategoria(), marketing: 0.2, utility: 0.05 },
};

describe("custoDoMes", () => {
  it("cobra por mensagem enviada quando a unidade é mensagem", () => {
    const c = custoDoMes(volume, porMensagem);
    expect(c.total).toBeCloseTo(1000 * 0.1 + 200 * 0.02);
    expect(c.linhas.find((l) => l.categoria === "marketing")?.unidades).toBe(1000);
  });

  it("cobra por conversa aberta quando a unidade é conversa", () => {
    const c = custoDoMes(volume, porConversa);
    expect(c.total).toBeCloseTo(400 * 0.2 + 150 * 0.05);
    expect(c.linhas.find((l) => l.categoria === "marketing")?.unidades).toBe(400);
  });

  it("categoria sem preço não vira custo", () => {
    const c = custoDoMes(volume, porMensagem);
    expect(c.linhas.find((l) => l.categoria === "authentication")?.total).toBe(0);
  });

  it("sempre devolve as quatro categorias, mesmo sem volume", () => {
    const c = custoDoMes({ ...volume, enviadosPorCategoria: zeradoPorCategoria() }, porMensagem);
    expect(c.linhas).toHaveLength(4);
    expect(c.total).toBe(0);
  });
});

describe("compararModelos", () => {
  it("mostra a diferença entre as duas tabelas para o mesmo volume", () => {
    const [r] = compararModelos([volume], porMensagem, {
      ...porMensagem,
      id: "futuro",
      precos: { ...zeradoPorCategoria(), marketing: 0.15, utility: 0.02 },
    });
    expect(r.atual).toBeCloseTo(104);
    expect(r.futuro).toBeCloseTo(154);
    expect(r.diferenca).toBeCloseTo(50);
    expect(r.variacao).toBeCloseTo(50 / 104);
  });

  it("não divide por zero quando não havia custo", () => {
    const vazio: VolumeDoMes = {
      mes: "2026-08",
      enviadosPorCategoria: zeradoPorCategoria(),
      gratuitosNaJanela: zeradoPorCategoria(),
      conversasPorCategoria: zeradoPorCategoria(),
      respostasLivres: 0,
      recebidas: 0,
    };
    const [r] = compararModelos([vazio], porMensagem, porMensagem);
    expect(r.variacao).toBeNull();
  });
});

describe("semPrecoConfigurado", () => {
  it("reconhece tabela ainda em branco", () => {
    expect(semPrecoConfigurado({ ...porMensagem, precos: zeradoPorCategoria() })).toBe(true);
    expect(semPrecoConfigurado(porMensagem)).toBe(false);
  });
});

describe("emReais", () => {
  it("converte o preço em dólar pela cotação", () => {
    expect(emReais(0.0625, 5.14)).toBeCloseTo(0.3213, 4);
  });

  it("câmbio inválido não vira número estranho", () => {
    expect(emReais(0.0625, 0)).toBe(0);
    expect(emReais(0.0625, -1)).toBe(0);
  });
});

describe("ISENTAS_NA_JANELA", () => {
  it("isenta utilidade e atendimento, cobra marketing", () => {
    expect(ISENTAS_NA_JANELA.has("utility")).toBe(true);
    expect(ISENTAS_NA_JANELA.has("service")).toBe(true);
    expect(ISENTAS_NA_JANELA.has("marketing")).toBe(false);
    expect(ISENTAS_NA_JANELA.has("authentication")).toBe(false);
  });
});
