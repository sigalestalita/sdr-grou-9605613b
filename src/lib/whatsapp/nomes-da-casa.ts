/*
 * O que é nosso não é o nome da empresa do lead.
 *
 * A pessoa chegou pelo anúncio com o texto pronto "quero mais informações
 * sobre licença PDA da Black September", e o extrator gravou "Black September"
 * como a empresa dela. Black September é a nossa campanha. Mesmo erro
 * aconteceria com "PDA", "Grou" ou "PDA Assessment": tudo que a pessoa
 * menciona por estar interessada, não por trabalhar lá.
 *
 * Instrução no prompt não resolve isso sozinha — o nome está ali, escrito com
 * maiúscula, parecendo empresa. A lista abaixo barra depois que o modelo
 * responde, que é onde as outras travas deste sistema também moram.
 */

function normalizar(texto: string | null | undefined): string {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Marcas, produtos e campanhas nossas. */
const NOSSOS = [
  "grou",
  "grou pp",
  "compass",
  "pda",
  "pda assessment",
  "assessment",
  "analista pda",
  "licenca pda",
  "black september",
  "black friday",
  "disc",
  "disc x pda",
];

/**
 * O texto é um nome nosso, e não da empresa do lead?
 *
 * Compara o texto inteiro, não por pedaço: "Grupo Grou Alimentos" seria uma
 * empresa real e não pode cair aqui. Só barra quando o nome é exatamente uma
 * das nossas coisas, com ou sem palavra de ligação.
 */
export function ehNomeDaCasa(texto: string | null | undefined): boolean {
  const t = normalizar(texto);
  if (!t) return false;
  const semRuido = t
    .replace(/^(a|o|as|os|da|de|do|das|dos|na|no|campanha|promocao|oferta|licenca)\s+/g, "")
    .trim();
  return NOSSOS.includes(t) || NOSSOS.includes(semRuido);
}
