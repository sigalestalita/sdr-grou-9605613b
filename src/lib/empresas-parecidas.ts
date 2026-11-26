/*
 * Regras puras da revisão de empresas parecidas: quando um grupo parece de
 * filiais (unidades da mesma rede, como Sicredi, Gerdau, Ambev) em vez de
 * cadastro duplicado, e qual nome sugerir para a empresa-mãe.
 */

const semAcento = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** Nome sem pontuação, sufixos societários e espaços repetidos. */
export function chaveDoNome(nome: string): string {
  return semAcento(nome)
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(ltda|ltd|s a|sa|eireli|me|epp|cia|companhia|do|da|de|dos|das|e)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const UF = /\b(ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to)\b/;
const MARCAS_DE_UNIDADE =
  /\b(filial|unidade|regional|matriz|sede|central|cooperativa|agencia|loja|planta|fabrica)\b/;

/**
 * Parece grupo de filiais quando os nomes são diferentes entre si e algum
 * traz código de unidade (0155, 2604), UF, "regional", "filial" etc., ou
 * quando o grupo vem só do mesmo domínio com nomes diferentes.
 */
export function pareceFiliais(nomes: string[], motivo: string): boolean {
  const chaves = new Set(nomes.map(chaveDoNome));
  if (chaves.size <= 1) return false; // mesmo nome: cara de cadastro duplicado
  if (motivo === "Mesmo domínio") return true;
  return nomes.some((n) => {
    const t = semAcento(n);
    return /\b\d{3,4}\b/.test(t) || UF.test(t) || MARCAS_DE_UNIDADE.test(t) || / - /.test(n);
  });
}

/**
 * Nome sugerido para a empresa-mãe: as palavras iniciais comuns a todos os
 * nomes ("Sicredi Sul SC - 2604" e "Sicredi Norte SC" → "Sicredi").
 */
export function sugerirNomeDaMae(nomes: string[]): string {
  const partes = nomes.map((n) => n.trim().split(/\s+/));
  if (!partes.length) return "";
  const comum: string[] = [];
  for (let i = 0; i < partes[0].length; i++) {
    const w = partes[0][i];
    if (partes.every((p) => p[i] && semAcento(p[i]) === semAcento(w))) comum.push(w);
    else break;
  }
  const nome = comum
    .join(" ")
    .replace(/[\s\-–—/,(]+$/, "")
    .trim();
  return nome.length >= 2 ? nome : "";
}
