import { describe, expect, it } from "vitest";
import {
  inicioParaRetomar,
  preencherRoteiro,
  ordenarFilaDeHoje,
  situacaoDoLead,
  type LeadNaCadencia,
  type PassoResumo,
} from "./fup-agenda";
import { buildCadencePlan } from "./sdr-cadence";
import { TRACK_STEPS } from "./sdr-playbook";

/*
 * As datas usam meio-dia e 18h UTC — os horários da trilha. Nessas horas o
 * dia do calendário é o mesmo em qualquer fuso entre UTC-11 e UTC+5, então os
 * testes não dependem do fuso da máquina que roda.
 */
const QUARTA_MEIO_DIA = new Date("2026-10-14T15:00:00.000Z");
const PME = TRACK_STEPS.pme;

function lead(passos: PassoResumo[], extras: Partial<LeadNaCadencia> = {}): LeadNaCadencia {
  return {
    leadId: "lead-1",
    leadName: "Ricardo",
    company: "Crgy",
    phone: null,
    priority: "media",
    stageName: "Em qualificação",
    assignedTo: "sdr-1",
    assignedName: "Lisiane",
    touchCount: 0,
    track: "pme",
    passos,
    ...extras,
  };
}

const pendente = (id: string, dueAt: string): PassoResumo => ({ id, dueAt, doneAt: null });
const feito = (id: string, dueAt: string): PassoResumo => ({ id, dueAt, doneAt: dueAt });

describe("situacaoDoLead", () => {
  it("separa o que é de hoje, o que venceu e o que vem depois", () => {
    const s = situacaoDoLead(
      lead([
        feito(PME[0].id, "2026-10-12T12:00:00.000Z"),
        pendente(PME[1].id, "2026-10-13T12:00:00.000Z"),
        pendente(PME[2].id, "2026-10-14T12:00:00.000Z"),
        pendente(PME[3].id, "2026-10-14T18:00:00.000Z"),
        pendente(PME[4].id, "2026-10-16T12:00:00.000Z"),
      ]),
      QUARTA_MEIO_DIA,
    );
    expect(s.hoje.map((p) => p.id)).toEqual([PME[2].id, PME[3].id]);
    expect(s.vencidos.map((p) => p.id)).toEqual([PME[1].id]);
    expect(s.depois?.id).toBe(PME[4].id);
    expect(s.proximo?.id).toBe(PME[1].id);
    expect(s.diasParado).toBe(1);
    expect([s.feitos, s.total]).toEqual([1, 5]);
  });

  it("anexa título, canal e roteiro do playbook ao passo", () => {
    const s = situacaoDoLead(
      lead([pendente(PME[0].id, "2026-10-14T12:00:00.000Z")]),
      QUARTA_MEIO_DIA,
    );
    expect(s.hoje[0].title).toBe(PME[0].title);
    expect(s.hoje[0].script).toBe(PME[0].script);
  });

  it("ignora passo de id desconhecido em vez de quebrar a tela", () => {
    const s = situacaoDoLead(
      lead([pendente("passo-que-saiu-do-playbook", "2026-10-14T12:00:00.000Z")]),
      QUARTA_MEIO_DIA,
    );
    expect(s.total).toBe(0);
  });

  it("conta quantos dias o lead está parado", () => {
    const s = situacaoDoLead(
      lead([pendente(PME[0].id, "2026-10-09T12:00:00.000Z")]),
      QUARTA_MEIO_DIA,
    );
    expect(s.diasParado).toBe(5);
  });
});

describe("ordenarFilaDeHoje", () => {
  const linha = (nome: string, prioridade: string, passos: PassoResumo[]) => {
    const l = lead(passos, { leadName: nome, priority: prioridade, leadId: nome });
    return { lead: l, situacao: situacaoDoLead(l, QUARTA_MEIO_DIA) };
  };
  const slaHoje = pendente(PME[0].id, "2026-10-14T12:00:00.000Z"); // WHATS (SLA <15m)
  const comumHoje = pendente(PME[3].id, "2026-10-14T12:00:00.000Z"); // TEL (ATIVA)

  it("SLA correndo vem antes de prioridade alta", () => {
    const fila = ordenarFilaDeHoje([
      linha("Alta sem SLA", "alta", [comumHoje]),
      linha("Baixa com SLA", "baixa", [slaHoje]),
    ]);
    expect(fila.map((l) => l.lead.leadName)).toEqual(["Baixa com SLA", "Alta sem SLA"]);
  });

  it("entre iguais, a prioridade decide", () => {
    const fila = ordenarFilaDeHoje([
      linha("Média", "media", [comumHoje]),
      linha("Alta", "alta", [comumHoje]),
    ]);
    expect(fila.map((l) => l.lead.leadName)).toEqual(["Alta", "Média"]);
  });

  it("lead com tudo feito hoje desce para o fim", () => {
    const fila = ordenarFilaDeHoje([
      linha("Já resolvido", "alta", [feito(PME[3].id, "2026-10-14T12:00:00.000Z")]),
      linha("Falta fazer", "baixa", [comumHoje]),
    ]);
    expect(fila.map((l) => l.lead.leadName)).toEqual(["Falta fazer", "Já resolvido"]);
  });
});

describe("inicioParaRetomar", () => {
  it("faz o passo onde o lead parou cair hoje, e o resto seguir dali", () => {
    // Quarta 14/10. O lead parou no passo do Dia 4.
    const passoDoDia4 = PME.find((p) => p.day === 4);
    expect(passoDoDia4).toBeTruthy();
    const inicio = inicioParaRetomar(4, QUARTA_MEIO_DIA);
    const plano = buildCadencePlan({ track: "pme", startAt: inicio, doneMap: {} });
    const dia4 = plano.steps.find((s) => s.id === passoDoDia4!.id);
    expect(dia4?.dueAt.slice(0, 10)).toBe("2026-10-14");
  });

  it("usa o dia de Brasília, não o de UTC, perto da meia-noite", () => {
    // 23h30 de terça em Brasília já é quarta em UTC; tem de retomar na terça.
    const terca2330 = new Date("2026-10-14T02:30:00.000Z");
    const inicio = inicioParaRetomar(1, terca2330);
    expect(inicio.slice(0, 10)).toBe("2026-10-13");
  });
});

describe("preencherRoteiro", () => {
  it("troca nome (só o primeiro), empresa e SDR", () => {
    expect(
      preencherRoteiro("Olá [Nome]! Aqui é [SDR], vi que a [Empresa] pediu uma demo.", {
        nome: "Ricardo Alves",
        empresa: "Crgy",
        sdr: "Lisiane Baudini",
      }),
    ).toBe("Olá Ricardo! Aqui é Lisiane, vi que a Crgy pediu uma demo.");
  });

  it("deixa o marcador à vista quando não há valor", () => {
    expect(preencherRoteiro("Olá [Nome], sobre a [Empresa]", { nome: "Ana" })).toBe(
      "Olá Ana, sobre a [Empresa]",
    );
  });
});
