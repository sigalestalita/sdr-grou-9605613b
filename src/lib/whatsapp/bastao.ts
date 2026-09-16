/*
 * Quando a IA pode passar o bastão.
 *
 * A instrução no prompt não segurou. O modelo transferia depois de o lead
 * dizer uma palavra e escrevia uma justificativa convincente para isso — "o
 * handoff imediato é o fluxo para este tipo de lead" —, regra que não existe
 * em lugar nenhum. Pedir para ele contar perguntas não funciona; contar aqui,
 * funciona.
 *
 * A trava é só para o bastão automático. Pedido explícito do lead passa
 * sempre: ninguém deve ser obrigado a responder a um robô para falar com
 * gente.
 */

/** Frases em que o lead pede pessoa, agenda ou proposta. */
const PEDIDOS_EXPLICITOS = [
  /\b(falar|conversar)\s+com\s+(uma\s+)?(pessoa|humano|atendente|algu[ée]m|consultor|especialista|vendedor)/i,
  /\b(quero|posso|gostaria de)\s+falar\s+com/i,
  /\b(atendimento|suporte)\s+humano\b/i,
  /\bmarcar\s+(uma\s+)?(reuni[ãa]o|call|convers|agenda|hor[áa]rio|demonstra)/i,
  /\b(agendar|agenda)\b.*\b(reuni[ãa]o|call|demo|hor[áa]rio)\b/i,
  /\b(reuni[ãa]o|call|demonstra[çc][ãa]o|demo)\b.*\b(quando|hor[áa]rio|dispon[íi]vel|marcar)\b/i,
  /\b(me\s+)?(manda|envia|passa)\s+(uma\s+)?proposta\b/i,
  /\b(proposta|or[çc]amento|contrato)\s+(comercial|formal)?\b.*\b(quero|preciso|manda|envia)\b/i,
  /\b(quero|preciso de)\s+(uma\s+)?(proposta|or[çc]amento|contrato)\b/i,
  /\bfechar\s+(o\s+)?(neg[óo]cio|contrato|pedido)\b/i,
];

export function pedidoExplicitoDeBastao(texto: string | null | undefined): boolean {
  const t = (texto ?? "").trim();
  if (!t) return false;
  return PEDIDOS_EXPLICITOS.some((re) => re.test(t));
}

/**
 * Mensagem que diz alguma coisa.
 *
 * "oi", "ok", "sim" não qualificam ninguém — e era em cima delas que a IA
 * decidia que já sabia o suficiente.
 */
export function mensagemSubstantiva(texto: string | null | undefined): boolean {
  const t = (texto ?? "").trim();
  if (t.length < 3) return false;
  const vazias =
    /^(oi|ol[áa]|ok|sim|n[ãa]o|bom dia|boa tarde|boa noite|obrigad[oa]|blz|certo)[.!?]*$/i;
  return !vazias.test(t);
}

export type AvaliacaoDoBastao = {
  liberado: boolean;
  motivo: string;
  substantivas: number;
};

/** Mínimo de respostas com conteúdo antes de transferir por conta própria. */
export const MINIMO_DE_RESPOSTAS = 2;

export function podePassarBastao(
  mensagensDoLead: Array<string | null | undefined>,
): AvaliacaoDoBastao {
  const substantivas = mensagensDoLead.filter(mensagemSubstantiva).length;

  if (mensagensDoLead.some(pedidoExplicitoDeBastao)) {
    return {
      liberado: true,
      motivo: "O lead pediu pessoa, agenda ou proposta.",
      substantivas,
    };
  }

  if (substantivas >= MINIMO_DE_RESPOSTAS) {
    return {
      liberado: true,
      motivo: `${substantivas} respostas com conteúdo: qualificação suficiente para transferir.`,
      substantivas,
    };
  }

  return {
    liberado: false,
    motivo: `Só ${substantivas} resposta(s) com conteúdo. Faltam perguntas antes de transferir — a IA segue qualificando.`,
    substantivas,
  };
}
