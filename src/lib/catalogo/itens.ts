/*
 * Itens do negócio e a divisão produto × serviço — parte pura, sem banco.
 *
 * Meta e comissão são separadas em produto e serviço. Uma proposta com
 * licença + certificação entra metade em cada; antes isso era feito à mão
 * numa planilha. Aqui a divisão sai dos itens do negócio, pelo tipo do
 * produto no catálogo.
 */

export type TipoItem = "produto" | "servico";

export const TIPO_LABEL: Record<TipoItem, string> = { produto: "Produto", servico: "Serviço" };

export type ItemNegocio = {
  product_id: string | null;
  nome: string;
  quantidade: number;
  valor_unitario: number;
  /** Tipo do produto no catálogo; null = item sem classificação. */
  tipo: TipoItem | null;
  /** Desconto do item, em % do bruto ou em R$ (como no RD). */
  desconto_tipo?: DescontoTipo;
  desconto?: number;
  recorrencia?: Recorrencia;
};

export type DescontoTipo = "pct" | "valor";
export type Recorrencia = "unico" | "mensal" | "anual";
export const RECORRENCIA_LABEL: Record<Recorrencia, string> = {
  unico: "Único",
  mensal: "Mensal",
  anual: "Anual",
};

type ContaItem = Pick<ItemNegocio, "quantidade" | "valor_unitario" | "desconto_tipo" | "desconto">;

const centavos = (v: number) => Math.round(v * 100) / 100;

/** Valor unitário × quantidade, antes do desconto. */
export function brutoItem(i: Pick<ItemNegocio, "quantidade" | "valor_unitario">): number {
  return centavos((Number(i.quantidade) || 0) * (Number(i.valor_unitario) || 0));
}

/** Quanto o desconto tira do item (nunca mais que o bruto). */
export function descontoItem(i: ContaItem): number {
  const bruto = brutoItem(i);
  const d = Math.max(Number(i.desconto) || 0, 0);
  const v = i.desconto_tipo === "valor" ? d : (bruto * Math.min(d, 100)) / 100;
  return centavos(Math.min(v, bruto));
}

/** Valor do item no negócio: bruto menos o desconto. */
export function totalItem(i: ContaItem): number {
  return centavos(brutoItem(i) - descontoItem(i));
}

export function totalItens(itens: ContaItem[]) {
  return centavos(itens.reduce((s, i) => s + totalItem(i), 0));
}

export type Divisao = { produto: number; servico: number; semTipo: number; total: number };

/**
 * Quanto do negócio é produto e quanto é serviço. Sem itens, o valor todo
 * fica "sem tipo" — aparece separado para o ADM classificar, em vez de cair
 * numa das metas por palpite.
 */
export function dividirNegocio(valorNegocio: number, itens: ItemNegocio[]): Divisao {
  if (itens.length === 0) {
    const v = centavos(Number(valorNegocio) || 0);
    return { produto: 0, servico: 0, semTipo: v, total: v };
  }
  const d: Divisao = { produto: 0, servico: 0, semTipo: 0, total: 0 };
  for (const i of itens) {
    const t = totalItem(i);
    if (i.tipo === "produto") d.produto += t;
    else if (i.tipo === "servico") d.servico += t;
    else d.semTipo += t;
  }
  d.produto = centavos(d.produto);
  d.servico = centavos(d.servico);
  d.semTipo = centavos(d.semTipo);
  d.total = centavos(d.produto + d.servico + d.semTipo);
  return d;
}

export function somarDivisoes(ds: Divisao[]): Divisao {
  return ds.reduce(
    (a, d) => ({
      produto: centavos(a.produto + d.produto),
      servico: centavos(a.servico + d.servico),
      semTipo: centavos(a.semTipo + d.semTipo),
      total: centavos(a.total + d.total),
    }),
    { produto: 0, servico: 0, semTipo: 0, total: 0 },
  );
}

/**
 * Proposta: valor total → impostos (retenções que o cliente faz na fonte) →
 * valor final. Os impostos vêm em valor; o % sugerido é o da política.
 */
export function proposta(
  total: number,
  impostos: number | null,
): { total: number; impostos: number; final: number } {
  const t = centavos(total);
  const imp = centavos(Math.min(Math.max(Number(impostos) || 0, 0), t));
  return { total: t, impostos: imp, final: centavos(t - imp) };
}
