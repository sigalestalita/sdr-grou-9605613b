import { describe, expect, it } from "vitest";
import {
  alertasPorTime,
  fatosParaIa,
  linhaDoTempo,
  montarCartoes,
  type DadosDaConta,
} from "./resumo-por-time";

const agora = Date.parse("2026-11-28T12:00:00Z");
const base = (): DadosDaConta => ({
  agora,
  leads: [],
  toques: [],
  negocios: [],
  atividadesNegocio: [],
  propostas: [],
  reunioesAnalisadas: [],
  fichas: [],
  reunioesCs: [],
  tarefasCs: [],
  tickets: [],
  oportunidades: [],
  registrosCs: [],
  fichasCadastrais: [],
  faturas: [],
  parcelas: [],
  requerimentos: [],
  sessoes: [],
  inscricoes: [],
});

describe("resumo da conta por time", () => {
  it("conta sem nada: cinco cartões vazios, sem alerta", () => {
    const c = montarCartoes(base());
    expect(c.map((x) => x.time)).toEqual(["sdr", "comercial", "cs", "adm", "trainers"]);
    expect(c.every((x) => x.vazio && !x.ultima && x.alertas.length === 0)).toBe(true);
  });

  it("alertas de cada time", () => {
    const d = base();
    d.leads.push({
      id: "l1",
      nome: "Ana",
      sdr: "Bia",
      criadoEm: "2026-10-01T10:00:00Z",
      reuniaoEm: null,
      followUpEm: "2026-11-20T10:00:00Z",
      etapa: null,
    });
    d.propostas.push({
      id: "p1",
      numero: 12,
      status: "enviada",
      valor: 5000,
      enviadaEm: "2026-11-10T10:00:00Z",
      aceitaEm: null,
      recusadaEm: null,
      criadoEm: "2026-11-10T10:00:00Z",
      quem: "Maicon",
    });
    d.fichas.push({
      clientUid: "u1",
      responsavel: "Carla",
      sinal: "vermelho",
      saude: 30,
      renovacao: "2026-12-20",
      ativo: true,
      ultimoContato: null,
    });
    d.tickets.push({
      id: "t1",
      numero: 7,
      titulo: "Erro no login",
      status: "aberto",
      criadoEm: "2026-11-27T10:00:00Z",
      resolvidoEm: null,
      quem: "Carla",
    });
    d.faturas.push({
      id: "f1",
      numeroNf: "100",
      emitidaEm: "2026-10-01T10:00:00Z",
      valorLiquido: 3000,
      status: "emitida",
      quem: "Dani",
    });
    d.parcelas.push({ faturaId: "f1", vencimento: "2026-11-01", valor: 1500, pagoEm: null });
    d.parcelas.push({
      faturaId: "f1",
      vencimento: "2026-10-15",
      valor: 1500,
      pagoEm: "2026-10-15",
    });
    d.fichasCadastrais.push({
      id: "c1",
      origem: "csv",
      enviadaEm: "2026-01-01T10:00:00Z",
      confirmadaEm: null,
      quem: null,
    });
    d.sessoes.push({
      id: "s1",
      requerimentoId: "r1",
      titulo: "Turma 1",
      data: "2026-11-20",
      status: "confirmado",
      trainer: "Rui",
    });
    const a = alertasPorTime(d);
    expect(a.sdr).toEqual(["1 follow-up vencido há mais de 3 dias"]);
    expect(a.comercial).toEqual(["1 proposta sem resposta há mais de 7 dias"]);
    expect(a.cs).toEqual(["Sinaleira vermelho", "1 ticket aberto", "Renovação em 22 dias"]);
    expect(a.adm).toHaveLength(1);
    expect(a.adm[0]).toMatch(/^1 parcela vencida \(R\$\s?1\.500\)$/);
    expect(a.trainers).toEqual(["1 sessão passada sem registro"]);
  });

  it("linha do tempo em ordem, do mais novo ao mais antigo, e última ação por time", () => {
    const d = base();
    d.negocios.push({
      id: "d1",
      nome: "PDA 2026",
      status: "won",
      valor: 10000,
      responsavel: "Maicon",
      criadoEm: "2026-09-01T10:00:00Z",
      fechadoEm: "2026-10-01T10:00:00Z",
      etapa: null,
    });
    d.reunioesCs.push({
      id: "m1",
      clientUid: "u1",
      titulo: "Kickoff",
      quando: "2026-11-05T10:00:00Z",
      status: "realizada",
      quem: "Carla",
      proximoPasso: null,
    });
    const ev = linhaDoTempo(d);
    expect(ev.map((e) => e.titulo)).toEqual([
      "Reunião: Kickoff",
      "Negócio ganho",
      "Negócio aberto",
    ]);
    const c = montarCartoes(d, ev);
    expect(c.find((x) => x.time === "comercial")?.ultima?.titulo).toBe("Negócio ganho");
    expect(c.find((x) => x.time === "cs")?.ultima?.quem).toBe("Carla");
  });

  it("os fatos para a IA trazem cada time e os últimos acontecimentos", () => {
    const d = base();
    d.leads.push({
      id: "l1",
      nome: "Ana",
      sdr: "Bia",
      criadoEm: "2026-11-01T10:00:00Z",
      reuniaoEm: null,
      followUpEm: null,
      etapa: null,
    });
    const ev = linhaDoTempo(d);
    const t = fatosParaIa("Indústria XPTO", montarCartoes(d, ev), ev, agora);
    expect(t).toContain("Empresa: Indústria XPTO");
    expect(t).toContain("SDR: responsáveis Bia;");
    expect(t).toContain("Trainers: nada registrado.");
    expect(t).toContain("[sdr] Lead entrou");
  });
});
