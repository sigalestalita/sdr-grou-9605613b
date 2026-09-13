import { describe, expect, it } from "vitest";
import {
  fracaoDoPeriodo,
  mesDe,
  progressoDaMeta,
  quantidadeSugerida,
  ritmo,
  type Meta,
  type Realizado,
} from "./metas";

const META: Meta = {
  meta_valor: 50000,
  meta_quantidade: 12,
  meta_agendas: 20,
  meta_propostas: null,
  meta_contatos: null,
};

const REAL: Realizado = { valor: 25000, quantidade: 2, agendas: 10, propostas: 4, contatos: 0 };

describe("progressoDaMeta", () => {
  it("mostra o caso que a gestora descreveu: valor perto do alvo, quantidade longe", () => {
    const p = progressoDaMeta(META, REAL);
    const valor = p.find((x) => x.chave === "valor")!;
    const qtd = p.find((x) => x.chave === "quantidade")!;
    expect(valor.pct).toBe(50);
    expect(qtd.pct).toBe(17);
    expect(qtd.falta).toBe(10);
  });

  it("ignora linha sem meta definida", () => {
    const chaves = progressoDaMeta(META, REAL).map((p) => p.chave);
    expect(chaves).toEqual(["valor", "quantidade", "agendas"]);
    expect(chaves).not.toContain("propostas");
  });

  it("não passa de 100% nem devolve falta negativa", () => {
    const p = progressoDaMeta(META, { ...REAL, valor: 80000 });
    const valor = p.find((x) => x.chave === "valor")!;
    expect(valor.pct).toBe(100);
    expect(valor.falta).toBe(0);
    expect(valor.atingiu).toBe(true);
  });
});

describe("ritmo", () => {
  const p = progressoDaMeta(META, REAL).find((x) => x.chave === "valor")!; // 50%

  it("em dia quando o realizado acompanha o calendário", () => {
    expect(ritmo(p, 0.4).status).toBe("em_dia");
  });

  it("atenção quando fica pouco atrás", () => {
    expect(ritmo(p, 0.6).status).toBe("atencao");
  });

  it("atrasado quando fica muito atrás", () => {
    expect(ritmo(p, 0.9).status).toBe("atrasado");
  });

  it("batido tem precedência sobre o calendário", () => {
    const batido = progressoDaMeta(META, { ...REAL, valor: 50000 }).find(
      (x) => x.chave === "valor",
    )!;
    expect(ritmo(batido, 0.1).status).toBe("batido");
  });
});

describe("quantidadeSugerida", () => {
  it("aplica a conta do ticket médio do briefing", () => {
    expect(quantidadeSugerida(50000, 4500)).toBe(12);
  });

  it("arredonda para cima", () => {
    expect(quantidadeSugerida(10000, 4500)).toBe(3);
  });

  it("aguenta valores zerados", () => {
    expect(quantidadeSugerida(0, 4500)).toBe(0);
    expect(quantidadeSugerida(50000, 0)).toBe(0);
  });
});

describe("fracaoDoPeriodo", () => {
  it("devolve a fração já percorrida do mês", () => {
    const inicio = new Date(2026, 8, 1);
    const fim = new Date(2026, 9, 1);
    expect(fracaoDoPeriodo(inicio, fim, new Date(2026, 8, 16))).toBeCloseTo(0.5, 1);
    expect(fracaoDoPeriodo(inicio, fim, new Date(2026, 7, 1))).toBe(0);
    expect(fracaoDoPeriodo(inicio, fim, new Date(2026, 10, 1))).toBe(1);
  });
});

describe("mesDe", () => {
  it("monta a chave do período no formato do banco", () => {
    expect(mesDe(new Date(2026, 8, 13)).chave).toBe("2026-09-01");
  });
});
