/*
 * Lista de e-mails subida para uma segmentação: lê o que veio colado de uma
 * planilha (colunas separadas por tab) ou de um CSV (vírgula ou ponto e
 * vírgula). Com cabeçalho, acha as colunas de e-mail, nome e empresa pelo
 * nome; sem cabeçalho, o e-mail é a coluna que tem cara de e-mail e as outras
 * viram nome e empresa, nessa ordem.
 */
export type ContatoDaLista = { email: string; nome: string | null; empresa: string | null };

export type LeituraDaLista = {
  contatos: ContatoDaLista[];
  /** Linhas com algo escrito mas sem e-mail válido (para mostrar). */
  invalidas: string[];
  /** E-mails repetidos na própria lista (ficam uma vez só). */
  repetidos: number;
};

export const MAX_CONTATOS_NA_LISTA = 20_000;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const normal = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** E-mail limpo (minúsculas, sem espaços, sem <> nem aspas) ou null. */
export function limparEmail(bruto: string): string | null {
  const m = bruto.match(/<([^>]+)>/);
  const e = normal(m ? m[1] : bruto)
    .replace(/^mailto:/, "")
    .replace(/^["'\s]+|["'\s;,.]+$/g, "");
  return EMAIL.test(e) && e.length <= 254 ? e : null;
}

function separadorDe(linhas: string[]): string {
  const amostra = linhas.slice(0, 20).join("\n");
  const conta = (s: string) => amostra.split(s).length - 1;
  if (conta("\t") > 0) return "\t";
  return conta(";") >= conta(",") && conta(";") > 0 ? ";" : ",";
}

/** Divide uma linha de CSV respeitando aspas. */
function colunas(linha: string, sep: string): string[] {
  if (sep === "\t") return linha.split("\t").map((c) => c.trim());
  const out: string[] = [];
  let atual = "";
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i];
    if (ch === '"') {
      if (aspas && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else aspas = !aspas;
    } else if (ch === sep && !aspas) {
      out.push(atual.trim());
      atual = "";
    } else atual += ch;
  }
  out.push(atual.trim());
  return out;
}

const CAB_EMAIL = ["email", "e-mail", "e mail", "mail", "endereco de e-mail", "endereco de email"];
const CAB_NOME = ["nome", "name", "contato", "nome completo", "primeiro nome"];
const CAB_EMPRESA = ["empresa", "company", "organizacao", "razao social", "cliente", "conta"];

const achar = (cab: string[], nomes: string[]) => cab.findIndex((c) => nomes.includes(c));

export function lerListaDeEmails(texto: string): LeituraDaLista {
  const linhas = texto
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (!linhas.length) return { contatos: [], invalidas: [], repetidos: 0 };

  const sep = separadorDe(linhas);
  const primeira = colunas(linhas[0], sep).map(normal);
  const temCabecalho = !primeira.some((c) => limparEmail(c)) && achar(primeira, CAB_EMAIL) >= 0;
  const iEmail = temCabecalho ? achar(primeira, CAB_EMAIL) : -1;
  const iNome = temCabecalho ? achar(primeira, CAB_NOME) : -1;
  const iEmpresa = temCabecalho ? achar(primeira, CAB_EMPRESA) : -1;

  const vistos = new Set<string>();
  const contatos: ContatoDaLista[] = [];
  const invalidas: string[] = [];
  let repetidos = 0;

  for (const linha of temCabecalho ? linhas.slice(1) : linhas) {
    const cols = colunas(linha, sep);
    let email: string | null = null;
    let nome: string | null = null;
    let empresa: string | null = null;
    if (temCabecalho) {
      email = limparEmail(cols[iEmail] ?? "");
      nome = iNome >= 0 ? cols[iNome] || null : null;
      empresa = iEmpresa >= 0 ? cols[iEmpresa] || null : null;
    } else {
      const i = cols.findIndex((c) => limparEmail(c));
      if (i >= 0) {
        email = limparEmail(cols[i]);
        const outras = cols.filter((c, j) => j !== i && c);
        nome = outras[0] ?? null;
        empresa = outras[1] ?? null;
      }
    }
    if (!email) {
      invalidas.push(linha.trim().slice(0, 200));
      continue;
    }
    if (vistos.has(email)) {
      repetidos++;
      continue;
    }
    vistos.add(email);
    contatos.push({
      email,
      nome: nome ? nome.slice(0, 200) : null,
      empresa: empresa ? empresa.slice(0, 200) : null,
    });
  }
  return { contatos, invalidas, repetidos };
}
