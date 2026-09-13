/*
 * Análise comercial — parte pura, sem banco.
 *
 * Recebe os negócios já carregados e devolve as séries que a gestora pediu no
 * briefing: evolução no tempo, conversão entre etapas, de onde vem a venda,
 * por que a gente perde e quanto tempo leva para fechar.
 */

export type NegocioAnalise = {
  id: string;
  status: string;
  amount: number | null;
  created_at: string;
  closed_at: string | null;
  ganho_em: string | null;
  executivo_user_id: string | null;
  stage_id: string | null;
  fonte: string | null;
  campanha: string | null;
  tipo_venda: string | null;
  motivo_venda: string | null;
  lost_reason: string | null;
  reuniao_em: string | null;
  agendado_em: string | null;
};

export type PontoMes = {
  /** "2026-09" */
  chave: string;
  rotulo: string;
  valor: number;
  quantidade: number;
  perdidos: number;
};

export type Fatia = { nome: string; quantidade: number; valor: number };

const MES_CURTO = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

function chaveMes(iso: string): { chave: string; rotulo: string } {
  const d = new Date(iso);
  const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return { chave, rotulo: `${MES_CURTO[d.getMonth()]}/${String(d.getFullYear()).slice(2)}` };
}

/** Série mensal de vendas ganhas, com as perdas do mesmo mês para contraste. */
export function porMes(
  negocios: NegocioAnalise[],
  meses: number,
  hoje: Date = new Date(),
): PontoMes[] {
  const serie = new Map<string, PontoMes>();
  // Mantém os meses vazios na série: buraco no gráfico também é informação.
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const { chave, rotulo } = chaveMes(d.toISOString());
    serie.set(chave, { chave, rotulo, valor: 0, quantidade: 0, perdidos: 0 });
  }
  for (const n of negocios) {
    if (n.ganho_em) {
      const { chave } = chaveMes(n.ganho_em);
      const p = serie.get(chave);
      if (p) {
        p.valor += Number(n.amount ?? 0);
        p.quantidade += 1;
      }
    } else if (n.status === "lost" && n.closed_at) {
      const { chave } = chaveMes(n.closed_at);
      const p = serie.get(chave);
      if (p) p.perdidos += 1;
    }
  }
  return [...serie.values()];
}

/**
 * Agrupa por uma dimensão de texto, junta a cauda longa em "Outros" e ordena
 * pelo que interessa. Sem isso a lista de fontes do RD vira ruído.
 */
export function agrupar(
  negocios: NegocioAnalise[],
  campo: (n: NegocioAnalise) => string | null,
  opts?: { topo?: number; ordenarPor?: "valor" | "quantidade" },
): Fatia[] {
  const topo = opts?.topo ?? 7;
  const chave = opts?.ordenarPor ?? "valor";
  const mapa = new Map<string, Fatia>();
  for (const n of negocios) {
    const bruto = (campo(n) ?? "").trim();
    const nome = bruto || "Não informado";
    const atual = mapa.get(nome) ?? { nome, quantidade: 0, valor: 0 };
    atual.quantidade += 1;
    atual.valor += Number(n.amount ?? 0);
    mapa.set(nome, atual);
  }
  const todas = [...mapa.values()].sort((a, b) => b[chave] - a[chave]);
  if (todas.length <= topo) return todas;
  const cabeca = todas.slice(0, topo);
  const cauda = todas.slice(topo);
  return [
    ...cabeca,
    {
      nome: `Outros (${cauda.length})`,
      quantidade: cauda.reduce((a, f) => a + f.quantidade, 0),
      valor: cauda.reduce((a, f) => a + f.valor, 0),
    },
  ];
}

export type EtapaFunil = {
  stageId: string;
  nome: string;
  ordem: number;
  quantidade: number;
  valor: number;
  /** Quantos por cento passaram da etapa anterior. */
  conversao: number | null;
};

/** Funil com a taxa de passagem entre etapas, que é o que mostra onde trava. */
export function funilComConversao(
  etapas: Array<{ id: string; nome: string; ordem: number }>,
  contagem: Map<string, { quantidade: number; valor: number }>,
): EtapaFunil[] {
  const ordenadas = [...etapas].sort((a, b) => a.ordem - b.ordem);
  return ordenadas.map((e, i) => {
    const atual = contagem.get(e.id) ?? { quantidade: 0, valor: 0 };
    const anterior = i > 0 ? (contagem.get(ordenadas[i - 1].id)?.quantidade ?? 0) : null;
    return {
      stageId: e.id,
      nome: e.nome,
      ordem: e.ordem,
      quantidade: atual.quantidade,
      valor: atual.valor,
      conversao: anterior && anterior > 0 ? Math.round((atual.quantidade / anterior) * 100) : null,
    };
  });
}

/** Mediana em dias; mediana e não média porque um negócio de 2 anos distorce. */
export function cicloMedianoDias(negocios: NegocioAnalise[]): number | null {
  const dias = negocios
    .filter((n) => n.ganho_em)
    .map((n) => (new Date(n.ganho_em!).getTime() - new Date(n.created_at).getTime()) / 86400000)
    .filter((d) => d >= 0 && d < 3 * 365)
    .sort((a, b) => a - b);
  if (dias.length === 0) return null;
  const meio = Math.floor(dias.length / 2);
  const v = dias.length % 2 ? dias[meio] : (dias[meio - 1] + dias[meio]) / 2;
  return Math.round(v);
}

/** Taxa de vitória entre o que foi decidido no período. */
export function taxaVitoria(negocios: NegocioAnalise[]): number | null {
  const ganhos = negocios.filter((n) => n.ganho_em).length;
  const perdidos = negocios.filter((n) => n.status === "lost" && n.closed_at).length;
  const decididos = ganhos + perdidos;
  return decididos ? Math.round((ganhos / decididos) * 100) : null;
}
