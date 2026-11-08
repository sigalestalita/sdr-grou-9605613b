/*
 * Acha a empresa do Compass que corresponde a um nome vindo de planilha
 * (sinaleira). Compara sem acento, caixa e sufixos societários; aceita
 * também quando um nome é o começo do outro ("PGT CONSULTORIA" e
 * "PGT Consultoria e Treinamento"), mas só se houver um candidato.
 */
const SUFIXOS = /\b(ltda|s\/?a|me|epp|eireli|mei|cia|e cia)\b\.?/g;

export function chaveDeNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(SUFIXOS, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function acharEmpresaPorNome<T extends { nome: string }>(
  nome: string,
  empresas: T[],
): T | null {
  const k = chaveDeNome(nome);
  if (k.length < 3) return null;
  const exatas = empresas.filter((e) => chaveDeNome(e.nome) === k);
  if (exatas.length === 1) return exatas[0];
  if (exatas.length > 1) return null;
  if (k.length < 5) return null;
  const prefixo = empresas.filter((e) => {
    const c = chaveDeNome(e.nome);
    return c.length >= 5 && (c.startsWith(`${k} `) || k.startsWith(`${c} `));
  });
  return prefixo.length === 1 ? prefixo[0] : null;
}
