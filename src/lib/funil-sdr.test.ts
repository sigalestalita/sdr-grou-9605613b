import { describe, expect, it } from "vitest";
import { ehDoRodizio, montarPainel, type NegocioDoFunil } from "./funil-sdr";

const n = (p: Partial<NegocioDoFunil>): NegocioDoFunil => ({
  rd_id: Math.random().toString(36).slice(2),
  name: "X",
  pipeline: "Leads - Empresa [SDR]",
  stage: "Novo",
  status: "open",
  owner_name: "Camila Mattie",
  rd_created_at: "2026-10-23T12:00:00Z",
  closed_at: null,
  ...p,
});

const SDRS = ["Camila Mattie", "Lisiane Baudini", "Mariana Borges"];

describe("ehDoRodizio", () => {
  it("reconhece pelo primeiro nome, como o RD mostra", () => {
    expect(ehDoRodizio("Lisiane", SDRS)).toBe(true);
    expect(ehDoRodizio("Camila Mattie", SDRS)).toBe(true);
    expect(ehDoRodizio("Estefany Silva Ramos", SDRS)).toBe(false);
    expect(ehDoRodizio(null, SDRS)).toBe(false);
  });
});

describe("montarPainel", () => {
  it("conta criadas pela criação e vendidas/perdidas pelo fechamento, como o relatório do RD", () => {
    const criadas = [
      n({}),
      n({ status: "won", stage: "Qualificado" }),
      n({ owner_name: "Lisiane", stage: "Tentativa" }),
      n({ owner_name: "Maicon Pellizzaro" }),
    ];
    const fechadas = [
      n({ status: "won" }),
      n({ status: "lost", owner_name: "Lisiane" }),
      n({ status: "lost", owner_name: "Lisiane" }),
    ];
    const p = montarPainel(criadas, fechadas, SDRS);
    expect(p.totais).toEqual({ criadas: 4, emAndamento: 3, vendidas: 1, perdidas: 2 });
    expect(p.linhas.map((l) => [l.dono, l.ehSdr])).toEqual([
      ["Camila Mattie", true],
      ["Lisiane", true],
      ["Maicon Pellizzaro", false],
    ]);
    expect(p.linhas[0].porEtapa).toEqual({ Novo: 1, Qualificado: 1 });
    expect(p.etapas).toEqual(["Novo", "Tentativa", "Qualificado"]);
    expect(p.foraDoRodizio.map((x) => x.owner_name)).toEqual(["Maicon Pellizzaro"]);
  });
});
