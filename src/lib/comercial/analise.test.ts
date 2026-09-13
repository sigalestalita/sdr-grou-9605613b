import { describe, expect, it } from "vitest";
import {
  agrupar,
  cicloMedianoDias,
  funilComConversao,
  porMes,
  taxaVitoria,
  type NegocioAnalise,
} from "./analise";

const base: NegocioAnalise = {
  id: "1",
  status: "won",
  amount: 10000,
  created_at: "2026-07-01T12:00:00Z",
  closed_at: "2026-08-10T12:00:00Z",
  ganho_em: "2026-08-10T12:00:00Z",
  executivo_user_id: "u1",
  stage_id: "s1",
  fonte: "Formulário do site",
  campanha: null,
  tipo_venda: "Serviço",
  motivo_venda: null,
  lost_reason: null,
  reuniao_em: null,
  agendado_em: null,
};

const HOJE = new Date(2026, 8, 13); // setembro de 2026

describe("porMes", () => {
  it("mantém os meses vazios na série", () => {
    const s = porMes([base], 3, HOJE);
    expect(s.map((p) => p.rotulo)).toEqual(["jul/26", "ago/26", "set/26"]);
    expect(s[1].valor).toBe(10000);
    expect(s[2].valor).toBe(0);
  });

  it("conta perdas no mês do fechamento, separadas das vendas", () => {
    const perdido: NegocioAnalise = {
      ...base,
      id: "2",
      status: "lost",
      ganho_em: null,
      closed_at: "2026-09-02T12:00:00Z",
    };
    const s = porMes([base, perdido], 3, HOJE);
    expect(s[2].perdidos).toBe(1);
    expect(s[2].quantidade).toBe(0);
  });

  it("ignora o que ficou fora da janela", () => {
    const antigo = { ...base, id: "3", ganho_em: "2025-01-10T12:00:00Z" };
    const s = porMes([antigo], 3, HOJE);
    expect(s.reduce((a, p) => a + p.quantidade, 0)).toBe(0);
  });
});

describe("agrupar", () => {
  const muitos: NegocioAnalise[] = Array.from({ length: 10 }, (_, i) => ({
    ...base,
    id: String(i),
    fonte: `Fonte ${i}`,
    amount: (10 - i) * 1000,
  }));

  it("junta a cauda longa em Outros", () => {
    const f = agrupar(muitos, (n) => n.fonte, { topo: 3 });
    expect(f).toHaveLength(4);
    expect(f[3].nome).toBe("Outros (7)");
    expect(f[3].quantidade).toBe(7);
  });

  it("ordena pelo valor por padrão", () => {
    const f = agrupar(muitos, (n) => n.fonte, { topo: 3 });
    expect(f[0].nome).toBe("Fonte 0");
  });

  it("trata vazio como Não informado", () => {
    const f = agrupar([{ ...base, fonte: "  " }], (n) => n.fonte);
    expect(f[0].nome).toBe("Não informado");
  });
});

describe("funilComConversao", () => {
  it("calcula a passagem de cada etapa a partir da anterior", () => {
    const etapas = [
      { id: "a", nome: "Agendamento", ordem: 1 },
      { id: "b", nome: "Proposta", ordem: 2 },
      { id: "c", nome: "Decisão", ordem: 3 },
    ];
    const contagem = new Map([
      ["a", { quantidade: 100, valor: 0 }],
      ["b", { quantidade: 40, valor: 0 }],
      ["c", { quantidade: 10, valor: 0 }],
    ]);
    const f = funilComConversao(etapas, contagem);
    expect(f[0].conversao).toBeNull();
    expect(f[1].conversao).toBe(40);
    expect(f[2].conversao).toBe(25);
  });

  it("não divide por zero quando a etapa anterior está vazia", () => {
    const etapas = [
      { id: "a", nome: "A", ordem: 1 },
      { id: "b", nome: "B", ordem: 2 },
    ];
    const f = funilComConversao(etapas, new Map([["b", { quantidade: 5, valor: 0 }]]));
    expect(f[1].conversao).toBeNull();
  });
});

describe("cicloMedianoDias", () => {
  it("usa a mediana, então um negócio muito longo não distorce", () => {
    const negocios = [
      { ...base, id: "1", created_at: "2026-08-01T00:00:00Z", ganho_em: "2026-08-11T00:00:00Z" },
      { ...base, id: "2", created_at: "2026-08-01T00:00:00Z", ganho_em: "2026-08-21T00:00:00Z" },
      { ...base, id: "3", created_at: "2026-01-01T00:00:00Z", ganho_em: "2026-08-01T00:00:00Z" },
    ];
    expect(cicloMedianoDias(negocios)).toBe(20);
  });

  it("devolve null sem vendas", () => {
    expect(cicloMedianoDias([{ ...base, ganho_em: null, status: "open" }])).toBeNull();
  });
});

describe("taxaVitoria", () => {
  it("olha só para o que foi decidido", () => {
    const negocios = [
      base,
      { ...base, id: "2", status: "lost", ganho_em: null },
      { ...base, id: "3", status: "open", ganho_em: null, closed_at: null },
    ];
    expect(taxaVitoria(negocios)).toBe(50);
  });

  it("devolve null quando nada foi decidido", () => {
    expect(taxaVitoria([{ ...base, status: "open", ganho_em: null, closed_at: null }])).toBeNull();
  });
});
