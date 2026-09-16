/*
 * Tirar a saudação repetida da resposta da IA.
 *
 * A conversa abre com o template, que já cumprimenta e se apresenta. Mesmo
 * com a regra no prompt, o modelo respondia "Olá Ana Paula! Lisiane aqui da
 * Grou." logo depois — parece que ninguém leu a mensagem anterior, e é o que
 * mais denuncia robô no WhatsApp.
 *
 * Pedir não resolveu duas vezes seguidas. Aqui a saudação é cortada depois,
 * como a trava do bastão: determinístico, sem depender de o modelo concordar.
 */

/*
 * "Olá Ana Paula!", "Oi, Ana!", "Bom dia Ana Paula,"
 *
 * Sem \b no fim da alternativa: em JavaScript \b não reconhece limite depois
 * de letra acentuada, então "Olá" simplesmente não casava. O lookahead exige
 * que a saudação termine em espaço ou pontuação, que é o mesmo efeito.
 */
const SAUDACAO =
  /^\s*(ol[áa]|oi|e\s*a[íi]|bom dia|boa tarde|boa noite)(?=[\s,!?.]|$)[^\n!?.]*[!?.,]*\s*/i;

/** "Lisiane aqui da Grou.", "Aqui é a Lisiane, da Grou!", "Sou a Lisiane da Grou." */
const APRESENTACAO =
  /^\s*(aqui\s+(é|e|quem\s+fala\s+é)\s+[^\n.!?]{1,60}|sou\s+(a|o)?\s*[^\n.!?]{1,60}|[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wÁ-ú]+\s+aqui[^\n.!?]{0,40})[.!?,]*\s*/;

/**
 * Corta saudação e reapresentação do começo da resposta.
 *
 * Só age quando já houve mensagem da nossa parte antes — na primeira
 * mensagem, cumprimentar é o certo.
 */
export function removerSaudacaoRepetida(texto: string, jaFalamosAntes: boolean): string {
  if (!jaFalamosAntes) return texto;
  const original = texto ?? "";
  let t = original.replace(/^\s+/, "");

  for (const re of [SAUDACAO, APRESENTACAO, SAUDACAO]) {
    const antes = t;
    t = t.replace(re, "");
    // Se a primeira linha virou vazia, sobe o resto.
    if (t !== antes) t = t.replace(/^\s*\n+/, "");
  }

  t = t.trim();
  // Cortar demais é pior do que não cortar: sem sobra útil, devolve o original.
  if (t.length < 12) return original.trim();

  // A frase que sobrou começa com minúscula se o corte partiu no meio.
  return t.charAt(0).toUpperCase() + t.slice(1);
}
