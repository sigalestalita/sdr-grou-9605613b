import { describe, expect, it } from "vitest";
import { planejarJornada, quandoPorExtenso } from "./jornada-agenda";

// Horários em São Paulo (-03:00).
const sp = (s: string) => new Date(`${s}-03:00`);
const resumo = (p: ReturnType<typeof planejarJornada>) =>
  p.map((x) => `${x.passo} ${x.enviarEm.toISOString()}`);

describe("planejarJornada", () => {
  it("reunião com folga: os quatro passos", () => {
    // marcada segunda 02/11 10h para sexta 06/11 14h
    const p = planejarJornada({
      agendadoEm: sp("2026-11-02T10:00:00"),
      reuniaoEm: sp("2026-11-06T14:00:00"),
    });
    expect(resumo(p)).toEqual([
      "confirmacao 2026-11-02T13:00:00.000Z",
      "material 2026-11-04T13:00:00.000Z", // quarta 10h
      "vespera 2026-11-05T20:00:00.000Z", // quinta 17h
      "lembrete 2026-11-06T16:00:00.000Z", // sexta 13h
    ]);
  });

  it("segunda-feira: véspera e material caem em dia útil", () => {
    const p = planejarJornada({
      agendadoEm: sp("2026-11-03T09:00:00"),
      reuniaoEm: sp("2026-11-09T10:00:00"),
    });
    expect(resumo(p)).toEqual([
      "confirmacao 2026-11-03T12:00:00.000Z",
      "material 2026-11-05T13:00:00.000Z", // quinta 10h
      "vespera 2026-11-06T20:00:00.000Z", // sexta 17h
      "lembrete 2026-11-09T12:00:00.000Z",
    ]);
  });

  it("em cima da hora: sem material, a véspera leva o material", () => {
    const p = planejarJornada({
      agendadoEm: sp("2026-11-04T15:00:00"),
      reuniaoEm: sp("2026-11-05T11:00:00"),
    });
    expect(p.map((x) => x.passo)).toEqual(["confirmacao", "vespera_material", "lembrete"]);
  });

  it("no mesmo dia: confirmação e lembrete; marcada para daqui a 1h, só confirmação", () => {
    expect(
      planejarJornada({
        agendadoEm: sp("2026-11-04T09:00:00"),
        reuniaoEm: sp("2026-11-04T15:00:00"),
      }).map((x) => x.passo),
    ).toEqual(["confirmacao", "lembrete"]);
    expect(
      planejarJornada({
        agendadoEm: sp("2026-11-04T14:00:00"),
        reuniaoEm: sp("2026-11-04T15:00:00"),
      }).map((x) => x.passo),
    ).toEqual(["confirmacao"]);
  });

  it("reunião no passado não planeja nada", () => {
    expect(
      planejarJornada({
        agendadoEm: sp("2026-11-04T14:00:00"),
        reuniaoEm: sp("2026-11-04T10:00:00"),
      }),
    ).toEqual([]);
  });

  it("confirmação vale por 2h; lembrete até a reunião", () => {
    const p = planejarJornada({
      agendadoEm: sp("2026-11-02T10:00:00"),
      reuniaoEm: sp("2026-11-06T14:00:00"),
    });
    expect(p[0].validoAte.toISOString()).toBe("2026-11-02T15:00:00.000Z");
    expect(p[3].validoAte.toISOString()).toBe("2026-11-06T17:00:00.000Z");
  });
});

describe("quandoPorExtenso", () => {
  it("dia da semana, data e horário em São Paulo", () => {
    expect(quandoPorExtenso(sp("2026-11-06T14:00:00"))).toEqual({
      dia_semana: "sexta-feira",
      data: "06/11",
      horario: "14h",
    });
    expect(quandoPorExtenso(sp("2026-11-09T09:30:00")).horario).toBe("9h30");
  });
});
