import { describe, expect, it } from "vitest";
import {
  computeMilestones,
  contractMonth,
  suggestMasterclasses,
  weeksInColor,
} from "./masterclass";

const now = new Date("2026-09-09T12:00:00Z");
const ids = (s: ReturnType<typeof suggestMasterclasses>) => s.map((x) => x.moduleId);

describe("regra de oferta por cor e tempo", () => {
  it("verde 3–4 semanas → 4 ou 5; verde 8+ → 6", () => {
    expect(
      ids(
        suggestMasterclasses(
          {
            history: ["amarelo", "verde", "verde", "verde"],
            tagUso: null,
            diagCause: null,
            contractStart: null,
            now,
          },
          [],
        ),
      ),
    ).toEqual([4, 5]);
    expect(
      ids(
        suggestMasterclasses(
          {
            history: Array(8).fill("verde"),
            tagUso: null,
            diagCause: null,
            contractStart: null,
            now,
          },
          [],
        ),
      ),
    ).toEqual([6]);
  });
  it("amarelo 3 semanas → módulo da tag_uso; ambos → 2 e 3; sem tag → nada", () => {
    const base = {
      history: ["verde", "amarelo", "amarelo", "amarelo"],
      diagCause: null,
      contractStart: null,
      now,
    };
    expect(ids(suggestMasterclasses({ ...base, tagUso: "recrutamento" }, []))).toEqual([2]);
    expect(ids(suggestMasterclasses({ ...base, tagUso: "ambos" }, []))).toEqual([2, 3]);
    expect(ids(suggestMasterclasses({ ...base, tagUso: null }, []))).toEqual([]);
  });
  it("vermelho depende da causa do diagnóstico", () => {
    const base = {
      history: ["vermelho", "vermelho"],
      tagUso: "desenvolvimento",
      contractStart: null,
      now,
    };
    expect(ids(suggestMasterclasses({ ...base, diagCause: "analista_novo" }, []))).toEqual([1]);
    expect(ids(suggestMasterclasses({ ...base, diagCause: "falta_projeto" }, []))).toEqual([2, 3]);
    expect(ids(suggestMasterclasses({ ...base, diagCause: null }, []))).toEqual([]);
  });
  it("marcos de contrato valem para qualquer cor e tiram módulos já feitos", () => {
    const mes3 = suggestMasterclasses(
      {
        history: ["verde"],
        tagUso: "recrutamento",
        diagCause: null,
        contractStart: "2026-06-25",
        now,
      },
      [{ module_id: 2, held_at: "2026-08-01", used_in_project: false }],
    );
    expect(ids(mes3)).toEqual([]); // módulo 2 já feito
    const mes6 = suggestMasterclasses(
      { history: ["amarelo"], tagUso: null, diagCause: null, contractStart: "2026-03-20", now },
      [],
    );
    expect(ids(mes6)).toEqual([4, 5]);
    expect(mes6[0].motivo).toMatch(/maturidade/);
  });
  it("helpers", () => {
    expect(weeksInColor(["verde", "sem_dado", "verde", "verde"])).toEqual({
      signal: "verde",
      weeks: 3,
    });
    expect(contractMonth("2026-09-01", now)).toBe(1);
    expect(contractMonth("2026-03-20", now)).toBe(6);
  });
});

describe("marcos de sucesso", () => {
  it("1º Sucesso: 2 dos módulos 1–3 e um uso real; 2º: módulo 5 usado", () => {
    const p = [
      { module_id: 1, held_at: "2026-05-10", used_in_project: false },
      { module_id: 1, held_at: "2026-05-20", used_in_project: false }, // repetido não conta
    ];
    expect(computeMilestones(p)).toEqual({ primeiro: null, segundo: null });
    p.push({
      module_id: 2,
      held_at: "2026-06-01",
      used_in_project: true,
      used_at: "2026-06-15",
    } as never);
    expect(computeMilestones(p).primeiro).toBe("2026-06-15");
    p.push({ module_id: 5, held_at: "2026-07-01", used_in_project: false });
    expect(computeMilestones(p).segundo).toBeNull();
    p[p.length - 1] = {
      module_id: 5,
      held_at: "2026-07-01",
      used_in_project: true,
      used_at: "2026-08-01",
    } as never;
    expect(computeMilestones(p).segundo).toBe("2026-08-01");
  });
});
