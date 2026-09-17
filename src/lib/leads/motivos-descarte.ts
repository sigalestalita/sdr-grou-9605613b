/*
 * Motivos de descarte, num lugar só.
 *
 * Havia três listas diferentes: o diálogo do kanban, o diálogo da ficha do
 * lead e um select com três opções na ficha. O filtro do kanban, por sua vez,
 * é montado a partir do que já está gravado — então ele mostrava motivos que
 * nenhuma das listas oferecia ("sem interesse", "lead duplicado") e mostrava o
 * mesmo motivo várias vezes quando a grafia mudava.
 *
 * Aqui ficam a lista oficial e a normalização que junta as variações.
 */

/** O que aparece para escolher, em qualquer tela. */
export const MOTIVOS_DE_DESCARTE = [
  "Sem perfil",
  "Sem fit com soluções",
  "Sem contato",
  "Sem interesse",
  "Interesse pessoal",
  "Sem orçamento",
  "Timing inadequado",
  "Concorrência",
  "Lead duplicado",
] as const;

export type MotivoDeDescarte = (typeof MOTIVOS_DE_DESCARTE)[number];

/** Tira acento, caixa e espaço repetido — a chave que junta as variações. */
export function chaveDoMotivo(raw: string | null | undefined): string {
  return (raw ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/*
 * Grafias que as SDRs já usaram e que significam a mesma coisa. A chave é o
 * resultado de chaveDoMotivo, então acento e caixa não importam aqui.
 */
const SINONIMOS: Record<string, MotivoDeDescarte> = {
  "sem perfil": "Sem perfil",
  "fora do perfil": "Sem perfil",
  "sem fit": "Sem fit com soluções",
  "sem fit com solucoes": "Sem fit com soluções",
  "sem fit com as solucoes": "Sem fit com soluções",
  "sem fit com a solucao": "Sem fit com soluções",
  "sem contato": "Sem contato",
  "sem retorno": "Sem contato",
  "nao respondeu": "Sem contato",
  "nao atendeu": "Sem contato",
  "sem resposta": "Sem contato",
  "sem interesse": "Sem interesse",
  "nao tem interesse": "Sem interesse",
  desinteresse: "Sem interesse",
  "interesse pessoal": "Interesse pessoal",
  "uso pessoal": "Interesse pessoal",
  "sem orcamento": "Sem orçamento",
  "sem verba": "Sem orçamento",
  "sem budget": "Sem orçamento",
  orcamento: "Sem orçamento",
  "timing inadequado": "Timing inadequado",
  timing: "Timing inadequado",
  "momento inadequado": "Timing inadequado",
  "fora de momento": "Timing inadequado",
  concorrencia: "Concorrência",
  concorrente: "Concorrência",
  "foi para o concorrente": "Concorrência",
  "lead duplicado": "Lead duplicado",
  duplicado: "Lead duplicado",
  duplicidade: "Lead duplicado",
};

/**
 * Devolve o motivo oficial quando reconhece a grafia; senão devolve null, e
 * quem chama decide o que fazer com o texto livre.
 */
export function motivoOficial(raw: string | null | undefined): MotivoDeDescarte | null {
  const chave = chaveDoMotivo(raw);
  if (!chave) return null;
  return SINONIMOS[chave] ?? null;
}

export type MotivoAgrupado = {
  /** A chave usada no filtro: o motivo oficial, ou a grafia normalizada. */
  valor: string;
  /** O que a pessoa lê. */
  rotulo: string;
  total: number;
  /** true quando é texto livre que ninguém padronizou. */
  livre: boolean;
};

/**
 * Junta as grafias de um mesmo motivo numa linha só.
 *
 * Texto livre que não bate com nenhum sinônimo continua aparecendo — a pessoa
 * precisa enxergar o que foi digitado à mão —, mas agrupado por grafia
 * normalizada e exibido com a versão mais usada.
 */
export function agruparMotivos(motivos: Array<string | null | undefined>): MotivoAgrupado[] {
  const grupos = new Map<
    string,
    { rotulo: string; total: number; livre: boolean; grafias: Map<string, number> }
  >();
  for (const bruto of motivos) {
    const texto = (bruto ?? "").trim();
    if (!texto) continue;
    const oficial = motivoOficial(texto);
    const valor = oficial ?? chaveDoMotivo(texto);
    if (!valor) continue;
    const g = grupos.get(valor) ?? {
      rotulo: oficial ?? texto,
      total: 0,
      livre: !oficial,
      grafias: new Map<string, number>(),
    };
    g.total += 1;
    if (!oficial) {
      const n = (g.grafias.get(texto) ?? 0) + 1;
      g.grafias.set(texto, n);
      // Mostra a grafia mais usada do grupo.
      const [maisUsada] = [...g.grafias.entries()].sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
      );
      g.rotulo = maisUsada[0];
    }
    grupos.set(valor, g);
  }
  return [...grupos.entries()]
    .map(([valor, g]) => ({ valor, rotulo: g.rotulo, total: g.total, livre: g.livre }))
    .sort((a, b) => b.total - a.total || a.rotulo.localeCompare(b.rotulo));
}

/** A chave de filtro de um lead, para comparar com MotivoAgrupado.valor. */
export function valorDoMotivo(raw: string | null | undefined): string | null {
  const texto = (raw ?? "").trim();
  if (!texto) return null;
  return (motivoOficial(texto) ?? chaveDoMotivo(texto)) || null;
}
