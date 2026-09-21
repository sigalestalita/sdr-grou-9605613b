/*
 * Uma resposta por vez.
 *
 * O lead mandou "Olá! Quero mais informações sobre licença PDA" e, um minuto
 * depois, "Oie". Cada mensagem recebida acorda o webhook, e os dois acordaram
 * a IA: saíram duas respostas quase idênticas, com um minuto de intervalo.
 *
 * Quem escreve no WhatsApp escreve em pedaços. Responder cada pedaço é
 * robótico, cara — cada template e cada resposta contam na fatura da Meta — e
 * ainda atropela a própria conversa.
 *
 * A decisão fica aqui, em código, e é consultada duas vezes: antes de gerar a
 * resposta, para não gastar chamada de modelo, e de novo antes de enviar, que
 * é quando a mensagem seguinte do lead costuma ter chegado.
 */

export type MensagemDaConversa = {
  sender_type: string;
  provider_message_id?: string | null;
  created_at: string;
};

export type Decisao = { responder: boolean; motivo: string };

const NOSSAS = new Set(["bot", "automation", "ai", "agent", "sdr", "human"]);
const DA_IA = new Set(["bot", "automation", "ai"]);

/** Quanto tempo esperar entre duas respostas automáticas na mesma conversa. */
export const DESCANSO_MS = 45_000;

export function decidirResposta(
  mensagens: MensagemDaConversa[],
  providerMessageIdQueAcordou: string | null | undefined,
  agora: number = Date.now(),
  descansoMs: number = DESCANSO_MS,
): Decisao {
  const emOrdem = [...mensagens].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  const doLead = emOrdem.filter((m) => m.sender_type === "lead");
  const ultimaDoLead = doLead[doLead.length - 1];
  if (!ultimaDoLead)
    return { responder: false, motivo: "Nenhuma mensagem do lead para responder." };

  /*
   * Chegou coisa nova depois da mensagem que nos acordou. Quem responde é a
   * execução da mensagem mais nova, que enxerga a conversa inteira.
   */
  if (
    providerMessageIdQueAcordou &&
    ultimaDoLead.provider_message_id &&
    ultimaDoLead.provider_message_id !== providerMessageIdQueAcordou
  ) {
    return {
      responder: false,
      motivo: "Chegou mensagem mais nova do lead; ela é que será respondida.",
    };
  }

  const ultimaNossa = emOrdem.filter((m) => NOSSAS.has(m.sender_type)).pop();
  if (ultimaNossa) {
    const tNossa = new Date(ultimaNossa.created_at).getTime();
    if (tNossa >= new Date(ultimaDoLead.created_at).getTime()) {
      return { responder: false, motivo: "A última mensagem do lead já foi respondida." };
    }
    if (DA_IA.has(ultimaNossa.sender_type) && agora - tNossa < descansoMs) {
      return { responder: false, motivo: "A IA acabou de responder nesta conversa." };
    }
  }

  return { responder: true, motivo: "Mensagem do lead ainda sem resposta." };
}
