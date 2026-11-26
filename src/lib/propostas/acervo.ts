/*
 * Acervo de slides da apresentação comercial — parte pura: agrupar por
 * serviço/produto, sugerir as seções pelos itens da proposta, montar a
 * apresentação escolhida e dar seção às páginas de um PDF importado.
 */
import type { Apresentacao } from "@/lib/propostas/render";
import { MAPA_DA_APRESENTACAO, SECOES_DA_APRESENTACAO } from "@/lib/propostas/apresentacao-grou";

export type SlideDoAcervo = {
  id: string;
  ordem: number;
  programa: string;
  secao: string;
  titulo: string | null;
  imagemUrl: string;
  ativo: boolean;
};

export type SecaoDoAcervo = { programa: string; secao: string; slides: SlideDoAcervo[] };

/** O institucional abre toda apresentação. */
export const PROGRAMA_INSTITUCIONAL = "grou";
export const MAX_SLIDES_NA_PROPOSTA = 120;

/** Seções na ordem em que aparecem no acervo (a ordem da apresentação). */
export function agruparPorSecao(slides: SlideDoAcervo[]): SecaoDoAcervo[] {
  const out: SecaoDoAcervo[] = [];
  const porPrograma = new Map<string, SecaoDoAcervo>();
  for (const s of [...slides].sort((a, b) => a.ordem - b.ordem)) {
    let g = porPrograma.get(s.programa);
    if (!g) {
      g = { programa: s.programa, secao: s.secao, slides: [] };
      porPrograma.set(s.programa, g);
      out.push(g);
    }
    g.slides.push(s);
  }
  return out;
}

const normal = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Palavras que, no nome de um item da proposta, indicam o serviço. O nome da
 * seção sempre vale; estas são as formas como o produto costuma aparecer no
 * catálogo. "pda" sozinho não basta (quase todo treinamento tem PDA no nome):
 * a licença/assessment é que puxa a seção do PDA Assessment.
 */
const APELIDOS: Record<string, string[]> = {
  pda: ["pda assessment", "licenca pda", "licencas pda", "creditos pda", "creditos"],
  qr: ["resiliencia"],
  dg: ["dilemas"],
  clima: ["clima"],
  "atlas-360": ["atlas"],
  "master-lider": ["master lider"],
  "lider-360": ["lider 360"],
  "nr1-liderancas": ["nr 1", "nr1"],
  "capacitacao-pda": ["analista comportamental", "certificacao"],
  "pda-para-lideres": ["pda para lideres"],
  "sensibilizacao-pda": ["sensibilizacao"],
  "team-building": ["team building"],
  "entrevista-competencias": ["entrevista por competencias"],
  "vendas-comportamental": ["comportamental para vendas"],
  "pdi-com-pda": ["workshop pdi"],
  "devolutiva-pda": ["devolutiva em grupo"],
  "comunicacao-comportamento": ["comunicacao e comportamento"],
  "assessment-40": ["assessment 5 0", "assessment 4 0"],
  "mentoria-comportamental": ["mentoria"],
  "devolutiva-individual": ["devolutiva individual"],
  "pdi-individual": ["pdi para desenvolvimento individual", "pdi individual"],
  "self-guru": ["self guru"],
  groutalent: ["groutalent", "grou talent", "hunting", "recrutamento e selecao"],
  "grou-academy": ["academy"],
};

/** Seções sugeridas para os itens da proposta (sempre com o institucional). */
export function sugerirProgramas(
  itens: string[],
  secoes: Array<{ programa: string; secao: string }>,
): string[] {
  const textos = itens.map(normal);
  const escolhidos = new Set<string>();
  for (const s of secoes) {
    if (s.programa === PROGRAMA_INSTITUCIONAL) continue;
    const chaves = [normal(s.secao), ...(APELIDOS[s.programa] ?? [])];
    if (textos.some((t) => chaves.some((k) => k && ` ${t} `.includes(` ${k} `))))
      escolhidos.add(s.programa);
  }
  const out = secoes.map((s) => s.programa).filter((p) => escolhidos.has(p));
  return secoes.some((s) => s.programa === PROGRAMA_INSTITUCIONAL)
    ? [PROGRAMA_INSTITUCIONAL, ...out]
    : out;
}

/** Apresentação da proposta com os slides escolhidos, na ordem do acervo. */
export function montarApresentacao(acervo: SlideDoAcervo[], escolhidos: Set<string>): Apresentacao {
  const slides = [...acervo]
    .filter((s) => s.ativo && escolhidos.has(s.id))
    .sort((a, b) => a.ordem - b.ordem);
  const secoes = agruparPorSecao(slides)
    .map((g) => g.secao)
    .filter((n) => n !== "A Grou");
  const titulo =
    secoes.length === 0
      ? "Apresentação Grou"
      : secoes.length <= 3
        ? `Grou · ${secoes.join(", ")}`
        : `Grou · ${secoes.slice(0, 3).join(", ")} e mais ${secoes.length - 3}`;
  return { titulo: titulo.slice(0, 200), slides: slides.map((s) => s.imagemUrl), fonte: "acervo" };
}

/**
 * Seção e título de cada página de um PDF importado. Com o mesmo número de
 * páginas da apresentação mapeada, cada página ganha a seção do mapa; senão,
 * tudo entra como "Sem seção" para a gestão ajustar na tela.
 */
export function secoesDasPaginas(
  totalPaginas: number,
): { programa: string; secao: string; titulo: string | null; mapeado: boolean }[] {
  const nomeDe = new Map(SECOES_DA_APRESENTACAO.map((s) => [s.programa, s.secao]));
  const mapeado = totalPaginas === MAPA_DA_APRESENTACAO.length;
  return Array.from({ length: totalPaginas }, (_, i) => {
    if (!mapeado) return { programa: "sem-secao", secao: "Sem seção", titulo: null, mapeado };
    const [programa, titulo] = MAPA_DA_APRESENTACAO[i];
    return { programa, secao: nomeDe.get(programa) ?? programa, titulo, mapeado };
  });
}
