/*
 * Cálculo da comissão — parte pura, sem banco. Reproduz a planilha
 * "Planilha Comissões 2026" (aba META E COMISSÃO GERAL):
 *
 *   IDEAL (base)  = meta × 5%                      (produto e serviço separados)
 *   COMISSÃO      = base × fator da faixa de atingimento
 *   SUPER META    = base × (atingimento − 100%)    (só acima de 100%)
 *   TOTAL         = COMISSÃO  (+ SUPER META, se a regra mandar somar)
 *
 * As faixas da planilha comparam com 49,995%, 59,995%…: o atingimento é
 * arredondado em duas casas antes de achar a faixa (49,996% conta como 50%).
 */

export type Faixa = { min: number; fator: number };

export type Regra = {
  base_pct: number;
  faixas: Faixa[];
  super_meta_soma: boolean;
  meta_self_guru_mensal: number;
};

export const REGRA_PADRAO: Regra = {
  base_pct: 5,
  faixas: [
    { min: 0, fator: 0 },
    { min: 50, fator: 20 },
    { min: 60, fator: 30 },
    { min: 70, fator: 40 },
    { min: 80, fator: 50 },
    { min: 90, fator: 80 },
    { min: 100, fator: 100 },
  ],
  super_meta_soma: false,
  meta_self_guru_mensal: 7000,
};

const r2 = (v: number) => Math.round(v * 100) / 100;

/** % de atingimento (0 quando não há meta), arredondado em 2 casas. */
export function atingimento(realizado: number, meta: number): number {
  if (!meta || meta <= 0) return 0;
  return r2((realizado / meta) * 100);
}

/** Fator (% da base) da maior faixa cujo mínimo foi alcançado. */
export function fatorDaFaixa(pct: number, faixas: Faixa[]): number {
  const ordenadas = [...faixas].sort((a, b) => a.min - b.min);
  let fator = 0;
  for (const f of ordenadas) if (pct >= f.min) fator = f.fator;
  return fator;
}

export type Parte = {
  meta: number;
  realizado: number;
  pct: number;
  base: number;
  fator: number;
  comissao: number;
  superMeta: number;
};

function parte(meta: number, realizado: number, regra: Regra): Parte {
  const pct = atingimento(realizado, meta);
  const base = r2((meta * regra.base_pct) / 100);
  const fator = fatorDaFaixa(pct, regra.faixas);
  return {
    meta,
    realizado,
    pct,
    base,
    fator,
    comissao: r2((base * fator) / 100),
    superMeta: pct > 100 ? r2((base * (pct - 100)) / 100) : 0,
  };
}

export type Resultado = {
  produto: Parte;
  servico: Parte;
  comissao: number;
  superMeta: number;
  total: number;
};

export function calcularComissao(
  e: {
    metaProduto: number;
    metaServico: number;
    realizadoProduto: number;
    realizadoServico: number;
  },
  regra: Regra = REGRA_PADRAO,
): Resultado {
  const produto = parte(e.metaProduto, e.realizadoProduto, regra);
  const servico = parte(e.metaServico, e.realizadoServico, regra);
  const comissao = r2(produto.comissao + servico.comissao);
  const superMeta = r2(produto.superMeta + servico.superMeta);
  return {
    produto,
    servico,
    comissao,
    superMeta,
    total: regra.super_meta_soma ? r2(comissao + superMeta) : comissao,
  };
}

/** Trimestres de verdade (jan–mar, abr–jun…). Na planilha, Q2 somava fev–abr. */
export function trimestre(mes: number): 1 | 2 | 3 | 4 {
  return (Math.floor((mes - 1) / 3) + 1) as 1 | 2 | 3 | 4;
}

export type LinhaComissao = {
  marca: string | null;
  tipo: "produto" | "servico" | null;
  valor_considerado: number;
  excluida: boolean;
};

/**
 * Realizado do fechamento a partir das linhas conferidas pelo ADM:
 * produto e serviço de PDA + Talogy; Self Guru à parte; sem tipo à parte.
 */
export function realizadoDasLinhas(linhas: LinhaComissao[]) {
  const out = { produto: 0, servico: 0, selfGuru: 0, semTipo: 0 };
  for (const l of linhas) {
    if (l.excluida) continue;
    const v = Number(l.valor_considerado) || 0;
    if ((l.marca ?? "").toLowerCase() === "self guru") out.selfGuru += v;
    else if (l.tipo === "produto") out.produto += v;
    else if (l.tipo === "servico") out.servico += v;
    else out.semTipo += v;
  }
  return {
    produto: r2(out.produto),
    servico: r2(out.servico),
    selfGuru: r2(out.selfGuru),
    semTipo: r2(out.semTipo),
  };
}
