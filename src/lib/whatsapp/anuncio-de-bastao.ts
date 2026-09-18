/*
 * Avisar que alguém vai assumir é coisa que se faz uma vez.
 *
 * A IA avisou "a pessoa especialista vai te explicar, combinado?", o lead
 * respondeu "combinado", e ela avisou de novo — agora com "vai te chamar aqui
 * no WhatsApp, pode ser?". A conversa trava num loop de combinar o mesmo
 * combinado, porque "combinado" não é resposta com conteúdo e a trava do
 * bastão continua segurando a transferência.
 *
 * Mesmo remédio das outras: em vez de pedir ao modelo, decide no código.
 * Concordar com o aviso vale como pedido de pessoa, e o aviso nunca se repete.
 */

function normalizar(texto: string | null | undefined): string {
  return (texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** A mensagem avisa que uma pessoa vai assumir, explicar ou chamar? */
const ANUNCIOS = [
  /\b(pessoa\s+)?(especialista|respons[a]vel|consultor[a]?)\b[^.!?]{0,80}\b(vai|ir[aá]|vou)\b/,
  /\b(vai|ir[aá])\s+(te\s+)?(chamar|explicar|assumir|entrar em contato|falar com voce)/,
  /\bvou\s+(te\s+)?(passar|encaminhar|transferir)\b/,
  /\bpasso\s+(voce\s+)?para\b/,
  /\bquem\s+(vai|ira)\s+(te\s+)?(atender|explicar|chamar)\b/,
];

export function anunciaBastao(texto: string | null | undefined): boolean {
  const t = normalizar(texto);
  if (!t) return false;
  return ANUNCIOS.some((re) => re.test(t));
}

/** "combinado", "pode ser", "ok", "perfeito" — o sim a um aviso já dado. */
const CONCORDANCIAS = [
  /^(sim|ok|okay|okey|blz|beleza|claro|certo|combinado|fechado|perfeito|isso|pode ser|pode sim|podemos|vamos|show|otimo|legal|maravilha|tudo bem|por favor|aguardo|no aguardo|agradeco|obrigad[oa])[\s.!?]*$/,
  /^(sim|ok|claro|perfeito|combinado)[\s,.!?]+/,
  /\bpode\s+(ser|chamar|mandar|me\s+chamar)\b/,
  /\bfico\s+no\s+aguardo\b/,
];

export function concordaComBastao(texto: string | null | undefined): boolean {
  const t = normalizar(texto);
  if (!t) return false;
  return CONCORDANCIAS.some((re) => re.test(t));
}

export type MensagemDaConversa = { sender_type: string; body: string | null };

const NOSSAS = new Set(["bot", "automation", "ai", "agent", "sdr", "human"]);

/**
 * O aviso já foi dado em alguma mensagem nossa?
 *
 * Serve para não repetir: se já avisamos, a próxima ação é transferir de
 * verdade, não avisar outra vez.
 */
export function jaAnunciouBastao(mensagens: MensagemDaConversa[]): boolean {
  return mensagens.some((m) => NOSSAS.has(m.sender_type) && anunciaBastao(m.body));
}

/**
 * Já avisamos e o lead topou: hora de transferir, calado.
 *
 * Olha só a última mensagem do lead — concordância antiga, já respondida, não
 * pode reabrir a transferência a cada mensagem nova.
 */
export function topouOBastao(mensagens: MensagemDaConversa[]): boolean {
  if (!jaAnunciouBastao(mensagens)) return false;
  const doLead = mensagens.filter((m) => m.sender_type === "lead");
  const ultima = doLead[doLead.length - 1];
  return concordaComBastao(ultima?.body);
}
