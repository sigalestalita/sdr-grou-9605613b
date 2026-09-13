/*
 * Metas comerciais — parte pura, sem banco.
 *
 * A gestora foi explícita: meta só em valor não serve. O exemplo dela é o caso
 * da executiva com meta de R$ 50 mil que bate fechando 2 negócios grandes,
 * enquanto a empresa precisa de 12 vendas porque o ticket médio é R$ 4,5 mil.
 * Por isso toda meta tem valor E quantidade, e as micrometas de atividade
 * (agendas, propostas, contatos) que sustentam as duas.
 */

export type Meta = {
  meta_valor: number;
  meta_quantidade: number;
  meta_agendas: number | null;
  meta_propostas: number | null;
  meta_contatos: number | null;
};

export type Realizado = {
  valor: number;
  quantidade: number;
  agendas: number;
  propostas: number;
  contatos: number;
};

export type Progresso = {
  chave: "valor" | "quantidade" | "agendas" | "propostas" | "contatos";
  rotulo: string;
  meta: number;
  realizado: number;
  /** 0 a 100, limitado para a barra não estourar. */
  pct: number;
  /** Quanto ainda falta (nunca negativo). */
  falta: number;
  atingiu: boolean;
};

const ROTULO: Record<Progresso["chave"], string> = {
  valor: "Valor vendido",
  quantidade: "Vendas fechadas",
  agendas: "Agendas realizadas",
  propostas: "Propostas enviadas",
  contatos: "Contatos feitos",
};

/** Quanto do mês já passou, de 0 a 1 — serve para saber se o ritmo está em dia. */
export function fracaoDoPeriodo(inicio: Date, fim: Date, agora: Date = new Date()): number {
  const total = fim.getTime() - inicio.getTime();
  if (total <= 0) return 1;
  const andado = agora.getTime() - inicio.getTime();
  return Math.min(1, Math.max(0, andado / total));
}

function linha(
  chave: Progresso["chave"],
  meta: number | null | undefined,
  realizado: number,
): Progresso | null {
  const alvo = Number(meta ?? 0);
  if (alvo <= 0) return null;
  return {
    chave,
    rotulo: ROTULO[chave],
    meta: alvo,
    realizado,
    pct: Math.min(100, Math.round((realizado / alvo) * 100)),
    falta: Math.max(0, alvo - realizado),
    atingiu: realizado >= alvo,
  };
}

/** Linhas de progresso, na ordem em que a gestora lê: resultado primeiro, atividade depois. */
export function progressoDaMeta(meta: Meta, real: Realizado): Progresso[] {
  return [
    linha("valor", meta.meta_valor, real.valor),
    linha("quantidade", meta.meta_quantidade, real.quantidade),
    linha("agendas", meta.meta_agendas, real.agendas),
    linha("propostas", meta.meta_propostas, real.propostas),
    linha("contatos", meta.meta_contatos, real.contatos),
  ].filter((l): l is Progresso => l !== null);
}

/**
 * O ritmo está em dia? Compara o quanto foi feito com o quanto o calendário já
 * andou. Sem isso a pessoa só descobre que ficou para trás no fim do mês.
 */
export type Ritmo = {
  esperadoPct: number;
  realizadoPct: number;
  status: "em_dia" | "atencao" | "atrasado" | "batido";
};

export function ritmo(p: Progresso, fracao: number): Ritmo {
  const esperadoPct = Math.round(fracao * 100);
  const realizadoPct = p.pct;
  let status: Ritmo["status"];
  if (p.atingiu) status = "batido";
  else if (realizadoPct >= esperadoPct) status = "em_dia";
  else if (realizadoPct >= esperadoPct - 15) status = "atencao";
  else status = "atrasado";
  return { esperadoPct, realizadoPct, status };
}

export const RITMO_LABEL: Record<Ritmo["status"], string> = {
  batido: "Meta batida",
  em_dia: "No ritmo",
  atencao: "Atenção",
  atrasado: "Atrasado",
};

/**
 * Sugere a quantidade coerente com o valor, pelo ticket médio. É a conta que a
 * gestora fez na reunião: 50 mil com ticket de 4,5 mil pede 12 vendas, não 2.
 */
export function quantidadeSugerida(metaValor: number, ticketMedio: number): number {
  if (metaValor <= 0 || ticketMedio <= 0) return 0;
  return Math.ceil(metaValor / ticketMedio);
}

/** Primeiro e último instante do mês de uma data (no fuso local). */
export function mesDe(d: Date): { inicio: Date; fim: Date; chave: string } {
  const inicio = new Date(d.getFullYear(), d.getMonth(), 1);
  const fim = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  const chave = `${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, "0")}-01`;
  return { inicio, fim, chave };
}

export const moeda = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
