import { describe, expect, it } from "vitest";
import { agruparPorDia, passosDaAgenda } from "./fup-agenda";
import type { CadenceStepState } from "./sdr-cadence";

const SEMANA = { from: "2026-10-11T00:00:00.000Z", to: "2026-10-18T00:00:00.000Z" };

function passo(id: string, dueAt: string, extras: Partial<CadenceStepState> = {}) {
  return {
    id,
    dueAt,
    done: false,
    doneAt: null,
    status: "futuro",
    day: 1,
    period: "manha",
    title: id,
    channel: "whatsapp",
    channelTag: "WHATS",
    actionType: "follow_up",
    script: "",
    ...extras,
  } as unknown as CadenceStepState;
}

describe("passosDaAgenda", () => {
  it("não repete o passo vencido que já cai dentro da semana", () => {
    // O card repetido em produção: terça é passado (vencido) e também está
    // dentro da semana visível, que começa no domingo.
    const terca = passo("d1-mapeamento", "2026-10-13T12:00:00.000Z", { status: "atrasado" });
    const sexta = passo("d5-ligacao", "2026-10-16T12:00:00.000Z");
    const saida = passosDaAgenda(
      { steps: [terca, sexta], firstLateStep: terca },
      SEMANA.from,
      SEMANA.to,
    );
    expect(saida).toHaveLength(2);
    expect(saida.filter((p) => p.id === "d1-mapeamento")).toHaveLength(1);
  });

  it("traz o passo vencido de semanas anteriores, que é o ponto de retomada", () => {
    const velho = passo("d1-entrada", "2026-10-02T12:00:00.000Z", { status: "atrasado" });
    const sexta = passo("d5-ligacao", "2026-10-16T12:00:00.000Z");
    const saida = passosDaAgenda(
      { steps: [velho, sexta], firstLateStep: velho },
      SEMANA.from,
      SEMANA.to,
    );
    expect(saida.map((p) => p.id)).toEqual(["d1-entrada", "d5-ligacao"]);
  });

  it("deixa de fora o que vence depois da semana visível", () => {
    const depois = passo("d27-breakup", "2026-11-02T12:00:00.000Z");
    const saida = passosDaAgenda({ steps: [depois], firstLateStep: null }, SEMANA.from, SEMANA.to);
    expect(saida).toEqual([]);
  });

  it("ignora passo já executado", () => {
    const feito = passo("d1-entrada", "2026-10-13T12:00:00.000Z", {
      done: true,
      doneAt: "2026-10-13T13:00:00.000Z",
      status: "feito",
    });
    const saida = passosDaAgenda({ steps: [feito], firstLateStep: null }, SEMANA.from, SEMANA.to);
    expect(saida).toEqual([]);
  });

  it("lead em dia, sem nada vencido, devolve só a semana", () => {
    const hoje = passo("d3-audio", "2026-10-16T12:00:00.000Z");
    const saida = passosDaAgenda({ steps: [hoje], firstLateStep: null }, SEMANA.from, SEMANA.to);
    expect(saida.map((p) => p.id)).toEqual(["d3-audio"]);
  });
});

describe("agruparPorDia", () => {
  it("junta num grupo só os toques do mesmo dia", () => {
    const saida = agruparPorDia([
      passo("d1-whats", "2026-10-14T12:00:00.000Z"),
      passo("d1-email", "2026-10-14T12:00:00.000Z"),
      passo("d1-tel", "2026-10-14T18:00:00.000Z"),
      passo("d2-tel", "2026-10-15T12:00:00.000Z"),
    ]);
    expect(saida.map((g) => g.length)).toEqual([3, 1]);
    expect(saida[0].map((p) => p.id)).toEqual(["d1-whats", "d1-email", "d1-tel"]);
  });

  it("preserva a ordem de chegada entre os dias", () => {
    const saida = agruparPorDia([
      passo("a", "2026-10-13T12:00:00.000Z"),
      passo("b", "2026-10-16T12:00:00.000Z"),
    ]);
    expect(saida.map((g) => g[0].id)).toEqual(["a", "b"]);
  });
});
