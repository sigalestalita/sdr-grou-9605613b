/*
 * Quando vale reabrir o tipo de lead.
 *
 * O perfil só é preenchido quando está vazio: dado de formulário vale mais do
 * que dedução de conversa. Só que a pessoa erra a resposta do formulário e
 * corrige no atendimento — "na verdade eu atendo outras empresas" — e aí o
 * lead está marcado como empresa e nunca chega na dona de consultoria.
 *
 * Este teste é o portão barato que decide se vale gastar uma chamada de modelo
 * para revisar o tipo. Ele não decide nada sozinho: quem confirma é o modelo,
 * e a correção só pode ir para consultoria, nunca sair dela.
 */

/** Sem acento e em caixa baixa, para "consultoria" e "consultória" caírem igual. */
function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const PISTAS = [
  /consultor(a|es|ia|ias)?(?=[\s,.!?;:]|$)/,
  /mentor(a|es|ia|ias)?(?=[\s,.!?;:]|$)/,
  /meus clientes/,
  /minhas clientes/,
  /meus? cliente(?=[\s,.!?;:]|$)/,
  /atendo (outras )?empresas/,
  /atender (outras )?empresas/,
  /presto servico/,
  /para (os )?meus clientes/,
];

/** O lead falou algo que indica atender outras empresas? */
export function falaDeConsultoria(textos: Array<string | null | undefined>): boolean {
  const texto = semAcento(textos.filter(Boolean).join(" "));
  if (!texto.trim()) return false;
  return PISTAS.some((p) => p.test(texto));
}
