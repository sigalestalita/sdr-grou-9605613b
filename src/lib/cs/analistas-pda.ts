/*
 * Leitura do CSV (ou colagem da planilha) de analistas PDA. As colunas são
 * achadas pelo nome do cabeçalho; o que não for reconhecido vai em "dados"
 * (fica guardado e aparece no detalhe). Datas dd/mm/aaaa viram aaaa-mm-dd.
 */
import { colunas, limparEmail, normal, separadorDe } from "@/lib/email-marketing/lista";

export type AnalistaDoCsv = {
  nome: string;
  email: string | null;
  telefone: string | null;
  cargo: string | null;
  empresa: string | null;
  cnpj: string | null;
  certificado_em: string | null;
  dados: Record<string, string>;
};

export type LeituraDeAnalistas = {
  analistas: AnalistaDoCsv[];
  /** Colunas reconhecidas: campo → cabeçalho da planilha. */
  colunas: Partial<Record<Campo, string>>;
  ignoradas: number;
  repetidos: number;
};

type Campo = "nome" | "email" | "telefone" | "cargo" | "empresa" | "cnpj" | "certificado_em";

export const MAX_ANALISTAS_POR_IMPORTACAO = 10_000;

const CABECALHOS: Record<Campo, string[]> = {
  nome: ["nome", "nome completo", "name", "analista", "participante", "aluno", "pessoa"],
  email: ["email", "e-mail", "e mail", "mail", "email do analista", "e-mail do analista"],
  telefone: ["telefone", "celular", "whatsapp", "fone", "telefone celular", "phone"],
  cargo: ["cargo", "funcao", "função", "job title"],
  empresa: [
    "empresa",
    "organizacao",
    "organização",
    "companhia",
    "cliente",
    "razao social",
    "razão social",
    "company",
  ],
  cnpj: ["cnpj", "cnpj da empresa"],
  certificado_em: [
    "data de certificacao",
    "data da certificacao",
    "data certificacao",
    "certificado em",
    "certificacao",
    "data de conclusao",
    "data da conclusao",
    "conclusao",
    "data",
  ],
};

/** "10/03/2025", "2025-03-10", "10-03-25" → "2025-03-10"; senão null. */
export function dataIso(bruto: string | null | undefined): string | null {
  const t = (bruto ?? "").trim();
  if (!t) return null;
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return valida(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    const ano = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return valida(ano, +m[2], +m[1]);
  }
  return null;
}

function valida(a: number, m: number, d: number): string | null {
  if (a < 1990 || a > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${a}-${p(m)}-${p(d)}`;
}

export function lerAnalistasPda(texto: string): LeituraDeAnalistas {
  const linhas = texto
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim());
  const vazio: LeituraDeAnalistas = { analistas: [], colunas: {}, ignoradas: 0, repetidos: 0 };
  if (linhas.length < 2) return vazio;
  const sep = separadorDe(linhas);
  const cab = colunas(linhas[0], sep);
  const cabNorm = cab.map(normal);
  const idx: Partial<Record<Campo, number>> = {};
  const usados = new Set<number>();
  for (const campo of Object.keys(CABECALHOS) as Campo[]) {
    const nomes = CABECALHOS[campo].map(normal);
    // Primeiro o nome exato; "data" genérico só se nada mais casou.
    const i = cabNorm.findIndex((c, j) => !usados.has(j) && nomes.includes(c));
    if (i >= 0) {
      idx[campo] = i;
      usados.add(i);
    }
  }
  if (idx.nome === undefined && idx.email === undefined) return vazio;

  const out: AnalistaDoCsv[] = [];
  const vistos = new Set<string>();
  let ignoradas = 0;
  let repetidos = 0;
  for (const linha of linhas.slice(1)) {
    const cols = colunas(linha, sep);
    const pegar = (c: Campo) => {
      const i = idx[c];
      const v = i === undefined ? "" : (cols[i] ?? "").trim();
      return v || null;
    };
    const email = pegar("email") ? limparEmail(pegar("email")!) : null;
    const nome = pegar("nome") ?? email;
    if (!nome) {
      ignoradas++;
      continue;
    }
    const chave = email ?? `${normal(nome)}|${normal(pegar("empresa") ?? "")}`;
    if (vistos.has(chave)) {
      repetidos++;
      continue;
    }
    vistos.add(chave);
    const dados: Record<string, string> = {};
    cab.forEach((h, i) => {
      if (!usados.has(i) && h && cols[i]?.trim())
        dados[h.slice(0, 80)] = cols[i].trim().slice(0, 500);
    });
    out.push({
      nome: nome.slice(0, 200),
      email,
      telefone: pegar("telefone")?.slice(0, 40) ?? null,
      cargo: pegar("cargo")?.slice(0, 120) ?? null,
      empresa: pegar("empresa")?.slice(0, 200) ?? null,
      cnpj: pegar("cnpj")?.replace(/\D/g, "").slice(0, 14) || null,
      certificado_em: dataIso(pegar("certificado_em")),
      dados,
    });
  }
  const nomes: Partial<Record<Campo, string>> = {};
  for (const [c, i] of Object.entries(idx)) nomes[c as Campo] = cab[i as number];
  return { analistas: out, colunas: nomes, ignoradas, repetidos };
}
