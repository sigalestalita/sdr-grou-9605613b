/*
 * Janela de atendimento do WhatsApp (as tais "24h").
 *
 * A Meta só deixa mandar mensagem livre até 24h depois da última mensagem que
 * a PESSOA enviou. Fora disso, só template aprovado. Se ela nunca escreveu, a
 * janela nunca abriu — o primeiro contato também tem que ser template.
 *
 * Aqui só o cálculo, sem banco e sem rede, para o inbox mostrar o estado antes
 * de o SDR digitar e para o alerta avisar antes de fechar.
 */

export const WINDOW_MS = 24 * 60 * 60 * 1000;
/** A partir daqui a janela entra em "fechando" e vira alerta. */
export const CLOSING_MS = 3 * 60 * 60 * 1000;

export type WindowState = "aberta" | "fechando" | "fechada" | "sem_contato";

export type ServiceWindow = {
  state: WindowState;
  /** Pode mandar mensagem livre agora? */
  canSendFreeText: boolean;
  lastInboundAt: string | null;
  /** Quando a janela fecha (null se nunca abriu). */
  expiresAt: string | null;
  msLeft: number;
  /** Frase curta para o topo da conversa. */
  label: string;
  /** O que o SDR precisa saber. */
  hint: string;
};

/** "6h20" / "45min" — quanto falta, em texto curto. */
export function formatLeft(ms: number): string {
  if (ms <= 0) return "0min";
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  if (h <= 0) return `${min}min`;
  if (min === 0) return `${h}h`;
  return `${h}h${String(min).padStart(2, "0")}`;
}

/**
 * Estado da janela a partir da última mensagem recebida do lead.
 * `lastInboundAt` nulo = a pessoa nunca respondeu.
 */
export function serviceWindow(
  lastInboundAt: string | null | undefined,
  now: Date = new Date(),
): ServiceWindow {
  if (!lastInboundAt) {
    return {
      state: "sem_contato",
      canSendFreeText: false,
      lastInboundAt: null,
      expiresAt: null,
      msLeft: 0,
      label: "Sem resposta do lead",
      hint: "Como a pessoa nunca escreveu, o WhatsApp só aceita template aprovado no primeiro contato.",
    };
  }

  const last = new Date(lastInboundAt).getTime();
  const expires = last + WINDOW_MS;
  const msLeft = expires - now.getTime();
  const expiresAt = new Date(expires).toISOString();

  if (msLeft <= 0) {
    return {
      state: "fechada",
      canSendFreeText: false,
      lastInboundAt,
      expiresAt,
      msLeft: 0,
      label: "Janela fechada",
      hint: "Passaram-se mais de 24h desde a última mensagem do lead. Só sai template aprovado — mensagem livre vai falhar.",
    };
  }

  if (msLeft <= CLOSING_MS) {
    return {
      state: "fechando",
      canSendFreeText: true,
      lastInboundAt,
      expiresAt,
      msLeft,
      label: `Janela fecha em ${formatLeft(msLeft)}`,
      hint: "Responda agora. Depois que fechar, só com template aprovado.",
    };
  }

  return {
    state: "aberta",
    canSendFreeText: true,
    lastInboundAt,
    expiresAt,
    msLeft,
    label: `Janela aberta · ${formatLeft(msLeft)}`,
    hint: "Dá para responder livremente até esse prazo.",
  };
}

/** Última mensagem vinda do lead numa lista já carregada. */
export function lastInboundFrom(
  messages: Array<{ sender_type: string; created_at: string }>,
): string | null {
  let last: string | null = null;
  for (const m of messages) {
    if (m.sender_type !== "lead") continue;
    if (!last || m.created_at > last) last = m.created_at;
  }
  return last;
}
