import { describe, expect, it } from "vitest";
import { buildCadencePlan } from "./sdr-cadence";
import { SDR_TRACKS } from "./sdr-playbook";

/** Sexta-feira: o pior começo possível, porque o dia seguinte é sábado. */
const SEXTA = "2026-10-16T12:00:00.000Z";

function diaDaSemana(iso: string) {
  return new Date(iso).getUTCDay();
}

describe("buildCadencePlan — trilha cai só em dia útil", () => {
  it("não agenda nenhum passo em sábado ou domingo, em nenhuma trilha", () => {
    for (const track of SDR_TRACKS) {
      const plan = buildCadencePlan({ track, startAt: SEXTA, doneMap: {} });
      const noFimDeSemana = plan.steps
        .filter((s) => [0, 6].includes(diaDaSemana(s.dueAt)))
        .map((s) => `${track}:${s.id}:${s.dueAt}`);
      expect(noFimDeSemana).toEqual([]);
    }
  });

  it("não mexe no passo que já cai em dia útil", () => {
    // Segunda 12/10: o dia 1 da trilha tem de continuar na própria segunda.
    const plan = buildCadencePlan({
      track: "pme",
      startAt: "2026-10-12T12:00:00.000Z",
      doneMap: {},
    });
    const diaUm = plan.steps.find((s) => s.day === 1);
    expect(diaUm?.dueAt.slice(0, 10)).toBe("2026-10-12");
  });

  it("empurra para segunda o passo que cairia no sábado", () => {
    // Começando numa sexta, o dia 2 cairia no sábado 17 e vai para 19.
    const plan = buildCadencePlan({ track: "pme", startAt: SEXTA, doneMap: {} });
    const diaDois = plan.steps.find((s) => s.day === 2);
    if (diaDois) expect(diaDois.dueAt.slice(0, 10)).toBe("2026-10-19");
  });
});
