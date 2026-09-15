/*
 * Ofertas comerciais que a IA pode citar.
 *
 * A IA ofereceu uma campanha que já tinha acabado. O preço não estava no
 * código: estava na base de conhecimento, que é texto livre sem validade, e
 * por isso sobreviveu ao fim da campanha.
 *
 * Aqui a oferta vira um item com data de fim. Depois do prazo ela some
 * sozinha do prompt, sem ninguém precisar lembrar de apagar.
 */

/**
 * Para quem a oferta vale.
 *
 * Consultoria e empresa compram coisas diferentes, e a campanha reflete isso —
 * consultoria ganha condição por faixa de crédito, empresa não. Sem separar, a
 * IA ofereceria à consultoria o desconto da empresa e vice-versa.
 */
export type PublicoDaOferta = "consultoria" | "empresa" | "todos";

export type Oferta = {
  titulo: string;
  detalhe: string;
  /** Último dia de validade, "2026-09-30". Sem data, vale por tempo indeterminado. */
  validoAte: string | null;
  /** Ausente vale como "todos", para as ofertas antigas seguirem funcionando. */
  publico?: PublicoDaOferta;
};

/** A trilha do lead decide quais ofertas existem para ele. */
export function ofertasDoPublico(ofertas: Oferta[], publico: PublicoDaOferta): Oferta[] {
  if (publico === "todos") return ofertas;
  return ofertas.filter((o) => !o.publico || o.publico === "todos" || o.publico === publico);
}

/** Só o que ainda está no prazo. */
export function ofertasVigentes(ofertas: Oferta[], hoje: Date = new Date()): Oferta[] {
  const corte = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime();
  return ofertas.filter((o) => {
    if (!o.titulo.trim()) return false;
    if (!o.validoAte) return true;
    const fim = new Date(`${o.validoAte}T23:59:59`).getTime();
    return Number.isFinite(fim) && fim >= corte;
  });
}

/** As que venceram, para a tela avisar em vez de deixar passar batido. */
export function ofertasVencidas(ofertas: Oferta[], hoje: Date = new Date()): Oferta[] {
  const vigentes = new Set(ofertasVigentes(ofertas, hoje).map((o) => o.titulo));
  return ofertas.filter((o) => o.titulo.trim() && !vigentes.has(o.titulo));
}

/**
 * Trecho do prompt sobre valores. Quando não há oferta vigente, a instrução
 * é o oposto: não falar de preço nenhum.
 */
export function blocoDeOfertas(
  ofertas: Oferta[],
  hoje: Date = new Date(),
  publico: PublicoDaOferta = "todos",
): string {
  const vigentes = ofertasDoPublico(ofertasVigentes(ofertas, hoje), publico);
  if (vigentes.length === 0) {
    return [
      "VALORES E CAMPANHAS: não existe nenhuma oferta vigente no momento.",
      "Não cite preço, desconto, condição especial, promoção ou valor de licença.",
      "Se o lead perguntar preço, diga que quem passa condições é a pessoa responsável e conduza para o handoff.",
    ].join(" ");
  }
  const lista = vigentes
    .map((o) => {
      const prazo = o.validoAte ? ` (válida até ${o.validoAte})` : "";
      const alvo =
        o.publico && o.publico !== "todos"
          ? ` [só para ${o.publico === "consultoria" ? "consultorias" : "empresas e pessoa física"}]`
          : "";
      return `- ${o.titulo}${prazo}${alvo}: ${o.detalhe}`;
    })
    .join("\n");
  return [
    "VALORES E CAMPANHAS: só pode citar as ofertas abaixo, exatamente como estão escritas.",
    "Qualquer preço, desconto ou condição que não esteja nesta lista não existe e não pode ser mencionado.",
    // Oferta marcada para um público é errada para o outro: consultoria compra
    // por faixa de crédito, empresa não. Citar a errada queima a condição.
    "Antes de citar uma oferta marcada para um público, confirme que o lead é daquele público.",
    "",
    lista,
  ].join("\n");
}

/*
 * Procura preço em texto livre. Serve para avisar quem configura que a base de
 * conhecimento tem valor escrito à mão, que é por onde a campanha vencida
 * voltou a aparecer.
 */
const PADROES_DE_PRECO = [
  /R\$\s?\d/i,
  /\b\d+\s?(reais|conto)\b/i,
  /\b\d{1,3}\s?%\s?(de\s+)?(desconto|off)\b/i,
  /\bpor\s+apenas\b/i,
  /\bpromo(ção|cional)\b/i,
  /\btempo\s+limitado\b/i,
];

export function pareceConterPreco(texto: string | null | undefined): boolean {
  const t = (texto ?? "").trim();
  if (!t) return false;
  return PADROES_DE_PRECO.some((re) => re.test(t));
}
