/*
 * A mensagem que o WhatsApp manda pelo lead não é conversa.
 *
 * Quem converte por formulário ou por clique no anúncio chega com um texto
 * pronto: "Olá! Preenchi seu formulário..." seguido dos campos, ou "Olá! Quero
 * mais informações sobre...". A pessoa não digitou aquilo — é o próprio evento
 * de conversão chegando em forma de mensagem.
 *
 * Isso importa porque a abertura do atendimento é suprimida para quem já
 * escreveu, e essa regra existe para não interromper conversa que já começou.
 * Tratar o texto pronto como conversa fazia o lead perder a primeira mensagem:
 * a que se apresenta, assina com o nome da SDR e leva a condição da campanha.
 */

function normalizar(texto: string | null | undefined): string {
  return (texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Blocos que só aparecem no texto pronto da conversão. */
const MARCAS = [
  /^ola!?\s*(eu\s+)?preenchi\s+(o\s+|seu\s+)?formulario/,
  /^ola!?\s*quero\s+(mais\s+)?informa(c|ç)oes/,
  /\bfirst name:\s*/,
  /\bphone number:\s*/,
  /\bwork email:\s*/,
  /\bcompany name:\s*/,
];

/** O texto é a conversão chegando, e não algo que a pessoa escreveu? */
export function ehMensagemDeConversao(texto: string | null | undefined): boolean {
  const t = normalizar(texto);
  if (!t) return false;
  return MARCAS.some((re) => re.test(t));
}

/** A pessoa escreveu alguma coisa de verdade, além do texto pronto? */
export function escreveuDeVerdade(textos: Array<string | null | undefined>): boolean {
  return textos.some((t) => (t ?? "").trim() !== "" && !ehMensagemDeConversao(t));
}
