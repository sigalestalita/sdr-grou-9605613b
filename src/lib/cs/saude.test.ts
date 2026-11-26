import { describe, expect, it } from "vitest";
import {
  DEFAULT_HEALTH_OPTIONS,
  DEFAULT_HEALTH_SIGNAL_POINTS,
  computeHealthScore,
  type HealthWeights,
} from "@/lib/cs-types";
import { montarEntradaDeSaude, respondeuNoWhatsapp, temSinaleira } from "./saude";

const PESOS: HealthWeights = {
  sinaleira: 40,
  agenda: 20,
  whatsapp: 10,
  proposta_aberta: 10,
  masterclass: 10,
  analista_pda: 10,
};
const vazio = {
  eventos90d: [],
  propostaAberta: false,
  temParticipacaoMasterclass: false,
  tags: [],
  analistaPda: false,
};
const score = (e: Parameters<typeof montarEntradaDeSaude>[0]) =>
  computeHealthScore(
    montarEntradaDeSaude(e),
    PESOS,
    DEFAULT_HEALTH_SIGNAL_POINTS,
    DEFAULT_HEALTH_OPTIONS,
  );

describe("temSinaleira", () => {
  it("vale com login PDA ou com cor vinda da planilha", () => {
    expect(temSinaleira({ login_pda: "acme" }, "sem_dado")).toBe(true);
    expect(temSinaleira({ login_pda: null }, "verde")).toBe(true);
    expect(temSinaleira({ login_pda: "" }, "vermelho")).toBe(true);
    expect(temSinaleira({ login_pda: null }, "sem_dado")).toBe(false);
    expect(temSinaleira({ login_pda: null }, "preto")).toBe(false);
  });

  it("não vale para quem não é licença PDA", () => {
    expect(temSinaleira({ tipo_servico: "consultoria", login_pda: "x" }, "verde")).toBe(false);
  });
});

describe("respondeuNoWhatsapp", () => {
  it("mensagem do cliente que chegou conta como resposta", () => {
    expect(
      respondeuNoWhatsapp([{ event_type: "whatsapp_recebido", channel: "whatsapp", metadata: {} }]),
    ).toBe(true);
  });

  it("envio sem resposta não conta; registro manual respondido conta", () => {
    expect(
      respondeuNoWhatsapp([{ event_type: "whatsapp_enviado", channel: "whatsapp", metadata: {} }]),
    ).toBe(false);
    expect(
      respondeuNoWhatsapp([
        { event_type: "contato", channel: "whatsapp", metadata: { answered: true } },
      ]),
    ).toBe(true);
  });
});

describe("health score com as entradas novas", () => {
  it("cliente verde sem login PDA deixa de ficar zerado", () => {
    // 40 de 100 possíveis: a sinaleira agora entra na conta
    expect(score({ ...vazio, cliente: { login_pda: null }, signal: "verde" })).toBe(40);
  });

  it("sem sinaleira, renormaliza sobre o resto; o WhatsApp respondido pontua", () => {
    const s = score({
      ...vazio,
      cliente: { login_pda: null },
      signal: "sem_dado",
      eventos90d: [{ event_type: "whatsapp_recebido", channel: "whatsapp", metadata: null }],
    });
    // 10 de 60 (os 40 da sinaleira saem da conta)
    expect(s).toBe(17);
  });

  it("vermelho sem nenhum engajamento continua zero", () => {
    expect(score({ ...vazio, cliente: { login_pda: "x" }, signal: "vermelho" })).toBe(0);
  });
});
