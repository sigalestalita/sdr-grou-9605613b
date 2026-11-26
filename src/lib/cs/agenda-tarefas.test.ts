import { describe, expect, it } from "vitest";
import {
  AGENDA_PADRAO,
  ajustarVencimento,
  diasDisponiveisNaSemana,
  motivoIndisponivel,
  proximoDiaDisponivel,
  type ConfigAgenda,
} from "./agenda-tarefas";

const cfg: ConfigAgenda = {
  ...AGENDA_PADRAO,
  feriados: [{ data: "2026-12-25", nome: "Natal" }],
  por_pessoa: { ana: { dias: [1, 2, 3, 4] } },
};
const ferias = [{ userId: "bia", inicio: "2026-12-01", fim: "2026-12-04", motivo: "férias" }];

describe("motivoIndisponivel", () => {
  it("feriado, fim de semana, dia que a pessoa não trabalha e ausência", () => {
    expect(motivoIndisponivel("2026-12-25", "bia", cfg, ferias)).toBe("feriado (Natal)");
    expect(motivoIndisponivel("2026-12-05", "bia", cfg, ferias)).toBe("não trabalha sábado");
    expect(motivoIndisponivel("2026-12-11", "ana", cfg, ferias)).toBe("não trabalha sexta");
    expect(motivoIndisponivel("2026-12-02", "bia", cfg, ferias)).toBe("ausente (férias)");
    expect(motivoIndisponivel("2026-12-02", "ana", cfg, ferias)).toBeNull();
  });
});

describe("proximoDiaDisponivel e semana", () => {
  it("pula férias e fim de semana", () => {
    expect(proximoDiaDisponivel("2026-12-02", "bia", cfg, ferias)).toBe("2026-12-07");
  });
  it("nas férias só sobra a segunda antes delas; semana do Natal perde a sexta", () => {
    expect(diasDisponiveisNaSemana("2026-11-30", "bia", cfg, ferias)).toEqual([1]);
    expect(diasDisponiveisNaSemana("2026-12-21", "bia", cfg, ferias)).toEqual([1, 2, 3, 4]);
    expect(diasDisponiveisNaSemana("2026-12-07", "ana", cfg, ferias)).toEqual([1, 2, 3, 4]);
  });
});

describe("ajustarVencimento", () => {
  it("tarefa no feriado vai para o próximo dia útil, no início do expediente", () => {
    const r = ajustarVencimento("2026-12-25T13:00:00.000Z", "bia", cfg, ferias);
    expect(r.movida).toBe(true);
    expect(r.iso).toBe("2026-12-28T11:00:00.000Z"); // segunda, 08:00 em Brasília
    expect(r.motivo).toBe("feriado (Natal)");
  });
  it("dia disponível não muda", () => {
    const r = ajustarVencimento("2026-12-09T13:00:00.000Z", "bia", cfg, ferias);
    expect(r).toEqual({ iso: "2026-12-09T13:00:00.000Z", movida: false, motivo: null });
  });
});
