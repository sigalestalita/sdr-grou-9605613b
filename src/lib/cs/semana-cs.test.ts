import { describe, expect, it } from "vitest";
import { montarSemana, primeiroDiaComVagaNova, type LinhaDaCarteira } from "./semana-cs";

function linha(i: number, dono: string | null, extra: Partial<LinhaDaCarteira["plan"]> = {}) {
  return {
    clientUid: `c${i}`,
    ownerId: dono,
    plan: {
      due: false,
      urgency: "normal",
      overdueDays: 0,
      dueAt: null,
      daysSinceContact: 10,
      suggestedWeekday: 1,
      ...extra,
    },
  } as LinhaDaCarteira;
}

const contaPorDia = (itens: { weekday: number; ownerId: string }[], dono: string) => {
  const c: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const i of itens) if (i.ownerId === dono) c[i.weekday]++;
  return c;
};

describe("agenda semanal do CS", () => {
  it("dá exatamente 8 por dia a cada analista com carteira grande", () => {
    const linhas = [
      ...Array.from({ length: 60 }, (_, i) => linha(i, "ana", { suggestedWeekday: 1 })),
      ...Array.from({ length: 45 }, (_, i) => linha(100 + i, "marcela", { suggestedWeekday: 3 })),
    ];
    const s = montarSemana(linhas, []);
    expect(contaPorDia(s, "ana")).toEqual({ 1: 8, 2: 8, 3: 8, 4: 8, 5: 8 });
    expect(contaPorDia(s, "marcela")).toEqual({ 1: 8, 2: 8, 3: 8, 4: 8, 5: 8 });
  });

  it("põe os devidos primeiro e completa com os próximos a vencer", () => {
    const linhas = [
      ...Array.from({ length: 50 }, (_, i) =>
        linha(i, "ana", { dueAt: `2026-12-${String((i % 28) + 1).padStart(2, "0")}` }),
      ),
      linha(999, "ana", { due: true, urgency: "crise", overdueDays: 5 }),
    ];
    const s = montarSemana(linhas, []);
    expect(s.some((i) => i.clientUid === "c999")).toBe(true);
    expect(s.filter((i) => i.ownerId === "ana")).toHaveLength(40);
  });

  it("respeita tarefas salvas e não deixa um dia passar de 8", () => {
    const linhas = Array.from({ length: 50 }, (_, i) => linha(i, "ana"));
    const tarefas = Array.from({ length: 10 }, (_, i) => ({
      clientUid: `c${i}`,
      weekday: 2,
      done: i < 3,
      ownerId: "ana",
    }));
    const s = montarSemana(linhas, tarefas);
    expect(contaPorDia(s, "ana")).toEqual({ 1: 8, 2: 8, 3: 8, 4: 8, 5: 8 });
    // As concluídas ficam no dia em que foram feitas.
    for (const i of [0, 1, 2]) expect(s.find((x) => x.clientUid === `c${i}`)?.weekday).toBe(2);
  });

  it("deixa de fora cliente sem CS", () => {
    const s = montarSemana([linha(1, null, { due: true })], []);
    expect(s).toHaveLength(0);
  });

  it("dia que já passou não recebe card novo; o salvo fica onde está", () => {
    const linhas = Array.from({ length: 60 }, (_, i) => linha(i, "ana", { suggestedWeekday: 1 }));
    const tarefas = [{ clientUid: "c0", weekday: 1, done: true, ownerId: "ana" }];
    // quinta-feira: só quinta e sexta recebem cards novos
    const s = montarSemana(linhas, tarefas, 8, 4);
    expect(contaPorDia(s, "ana")).toEqual({ 1: 1, 2: 0, 3: 0, 4: 8, 5: 8 });
  });

  it("semana que já passou só mostra o que estava salvo", () => {
    const linhas = Array.from({ length: 20 }, (_, i) => linha(i, "ana"));
    const tarefas = [{ clientUid: "c3", weekday: 2, done: false, ownerId: "ana" }];
    const s = montarSemana(linhas, tarefas, 8, 6);
    expect(s.map((i) => i.clientUid)).toEqual(["c3"]);
  });
});

describe("primeiroDiaComVagaNova", () => {
  // semana de segunda 23/11/2026
  const semana = "2026-11-23";
  it("semana atual começa hoje; fim de semana não tem vaga", () => {
    expect(primeiroDiaComVagaNova(semana, new Date(2026, 10, 23, 9))).toBe(1);
    expect(primeiroDiaComVagaNova(semana, new Date(2026, 10, 26, 8))).toBe(4);
    expect(primeiroDiaComVagaNova(semana, new Date(2026, 10, 28, 10))).toBe(6);
  });

  it("semana futura começa na segunda; semana passada não recebe nada", () => {
    expect(primeiroDiaComVagaNova("2026-11-30", new Date(2026, 10, 26))).toBe(1);
    expect(primeiroDiaComVagaNova("2026-11-16", new Date(2026, 10, 26))).toBe(6);
  });
});
