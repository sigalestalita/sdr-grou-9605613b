/*
 * Quem escreve procurando vaga.
 *
 * Chega pelo mesmo anúncio e pelo mesmo número: "vocês estão contratando?".
 * Não é lead, e tratar como lead gasta o tempo da SDR e o da pessoa — que só
 * quer saber para onde mandar o currículo.
 *
 * A detecção é de código, não do modelo: a resposta aqui é sempre a mesma e o
 * card vai para desqualificado. Decisão automática com consequência no funil
 * precisa ser previsível.
 */

/** Para onde mandar currículo. */
export const EMAIL_DE_RH = "rh@grougp.com.br";

function normalizar(texto: string | null | undefined): string {
  return (texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const PISTAS = [
  /\b(voces|vcs)\s+(estao|tao|est[aã]o)\s+contratando\b/,
  /\bestao\s+contratando\b/,
  /\bta[o]?\s+contratando\b/,
  /\bh[aá]\s+vagas?\b/,
  /\btem\s+vagas?\b/,
  /\bvaga\s+(de|para|aberta)\b/,
  /\bcurriculo\b/,
  /\bcurr[ií]culos?\b/,
  /\bcv\b/,
  /\bprocesso\s+seletivo\b/,
  /\brecrutamento\b/,
  /\b(quero|gostaria de|estou|to)\s+(procurando|buscando)\s+(emprego|trabalho|vaga|recoloca)/,
  /\btrabalhar\s+(com|na|ai)\s+voc/,
  /\bme\s+candidatar\b/,
  /\benviar\s+(meu\s+)?curr/,
  /\boportunidade\s+de\s+(emprego|trabalho)\b/,
];

/*
 * Palavras que aparecem em conversa comercial e não podem virar falso
 * positivo: quem diz "quero contratar o PDA" está comprando, não pedindo vaga.
 */
const COMERCIAL = [
  /\bcontratar\s+(o\s+|a\s+|um\s+|uma\s+)?(pda|assessment|licenca|plano|servico|solucao|treinamento|capacita)/,
  /\bcontratar\s+voces\b/,
  /\bquero\s+contratar\b/,
];

export function procuraEmprego(texto: string | null | undefined): boolean {
  const t = normalizar(texto);
  if (!t.trim()) return false;
  if (COMERCIAL.some((re) => re.test(t))) return false;
  return PISTAS.some((re) => re.test(t));
}

/** A resposta, sempre a mesma: educada, útil e sem prometer retorno. */
export function respostaParaCandidato(primeiroNome: string | null | undefined): string {
  const nome = (primeiroNome ?? "").trim().split(" ")[0];
  const abertura = nome ? `Oi ${nome}!` : "Oi!";
  return [
    `${abertura} Obrigada pelo contato.`,
    "",
    "Por aqui a gente cuida das soluções de gestão de pessoas para empresas e consultorias, então as vagas não passam por este canal.",
    "",
    `Para se candidatar, é só enviar seu currículo para ${EMAIL_DE_RH} — é lá que o time de RH acompanha.`,
    "",
    "Boa sorte!",
  ].join("\n");
}
