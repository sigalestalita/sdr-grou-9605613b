/*
 * Entradas do health score a partir dos dados da ficha — parte pura, usada
 * pelo recálculo de uma empresa (recomputeHealth) e pelo da carteira inteira
 * (recomputeHealthAll), para os dois darem sempre o mesmo número.
 */
import type { CsSignal, HealthInput } from "@/lib/cs-types";

export type EventoParaSaude = {
  event_type: string;
  channel: string | null;
  metadata: unknown;
};

const CORES: CsSignal[] = ["verde", "amarelo", "vermelho"];

/**
 * A sinaleira vale para licença PDA (ou sem tipo de serviço) quando há login
 * PDA cadastrado ou quando a planilha já trouxe uma cor para a empresa. Antes
 * só o login contava, e um cliente verde sem login ficava com saúde zero.
 */
export function temSinaleira(
  c: { tipo_servico?: string | null; login_pda?: string | null },
  signal: CsSignal,
): boolean {
  const licenca = c.tipo_servico == null || c.tipo_servico === "licenca_pda";
  return licenca && (!!c.login_pda?.trim() || CORES.includes(signal));
}

/** Agenda realizada: registro manual de agenda + reunião liquidada pela agenda vinculada. */
export function agendasNoPeriodo(eventos: EventoParaSaude[]): number {
  return eventos.filter((e) => e.event_type === "agenda" || e.event_type === "reuniao_realizada")
    .length;
}

/**
 * Cliente respondeu no WhatsApp: mensagem dele que chegou (whatsapp_recebido,
 * gravada pelo gatilho da caixa) ou contato registrado à mão como respondido.
 */
export function respondeuNoWhatsapp(eventos: EventoParaSaude[]): boolean {
  return eventos.some((e) => {
    if (e.event_type === "whatsapp_recebido") return true;
    const meta = (e.metadata ?? {}) as Record<string, unknown>;
    return e.channel === "whatsapp" && (meta["answered"] === true || meta["engajamento"] === true);
  });
}

export function montarEntradaDeSaude(d: {
  cliente: { tipo_servico?: string | null; login_pda?: string | null };
  signal: CsSignal;
  eventos90d: EventoParaSaude[];
  propostaAberta: boolean;
  temParticipacaoMasterclass: boolean;
  tags: string[];
  analistaPda: boolean;
  usaPlataforma?: boolean;
}): HealthInput {
  return {
    signal: d.signal,
    hasSinaleira: temSinaleira(d.cliente, d.signal),
    agendaLast90d: agendasNoPeriodo(d.eventos90d),
    whatsappAnswered: respondeuNoWhatsapp(d.eventos90d),
    propostaAberta: d.propostaAberta,
    // participação registrada (a tag antiga de masterclass ainda vale)
    masterclass: d.temParticipacaoMasterclass || d.tags.some((t) => /masterclass/i.test(t)),
    analistaPda: d.analistaPda,
    usaPlataforma: d.usaPlataforma ?? false,
  };
}
