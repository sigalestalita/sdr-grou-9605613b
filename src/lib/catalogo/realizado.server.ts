import type { SupabaseClient } from "@supabase/supabase-js";
import { dividirNegocio, type Divisao, type ItemNegocio, type TipoItem } from "./itens";
import { dataSP, inicioDoDiaSP } from "@/lib/datas-sp";
import { emLotes, todasAsPaginas } from "@/lib/paginar.server";

/*
 * Venda realizada no período, dividida em produto × serviço, por executivo.
 * Base: a data do ganho (ordem de compra; sem ela, closed_at) — a mesma regra
 * da meta (deal_data_ganho). Usada pela tela de metas e pela comissão.
 */

export type NegocioRealizado = {
  id: string;
  nome: string;
  empresa: string | null;
  executivoId: string | null;
  /** Dia do ganho em Brasília, "YYYY-MM-DD". */
  dataGanho: string;
  valor: number;
  tipoVenda: string | null;
  parcelas: number | null;
  divisao: Divisao;
  itens: Array<{ nome: string; tipo: TipoItem | null; marca: string | null; total: number }>;
};

export async function negociosGanhosNoPeriodo(
  db: SupabaseClient,
  ini: string,
  fim: string,
  executivoId?: string | null,
): Promise<NegocioRealizado[]> {
  // ordem_compra_em no período, ou (sem OC) closed_at no período — em Brasília.
  const a = inicioDoDiaSP(ini);
  const b = inicioDoDiaSP(fim);
  const lista = await todasAsPaginas<Record<string, unknown>>((de, ate) => {
    let q = db
      .from("deals")
      .select(
        "id, nome, amount, executivo_user_id, ordem_compra_em, closed_at, tipo_venda, parcelas, companies:company_id(nome)",
      )
      .eq("status", "won")
      .or(
        `and(ordem_compra_em.gte.${a},ordem_compra_em.lt.${b}),and(ordem_compra_em.is.null,closed_at.gte.${a},closed_at.lt.${b})`,
      )
      .order("id")
      .range(de, ate);
    if (executivoId) q = q.eq("executivo_user_id", executivoId);
    return q;
  });
  if (lista.length === 0) return [];

  const itens = await emLotes<Record<string, unknown>>(
    lista.map((d) => d.id as string),
    (lote) =>
      db
        .from("deal_products")
        .select(
          "deal_id, nome, quantidade, valor_unitario, product_id, products:product_id(tipo, marca)",
        )
        .in("deal_id", lote),
  );

  const porDeal = new Map<string, Array<ItemNegocio & { marca: string | null }>>();
  for (const i of itens) {
    const prod = i.products as { tipo?: TipoItem | null; marca?: string | null } | null;
    const arr = porDeal.get(i.deal_id as string) ?? [];
    arr.push({
      product_id: (i.product_id as string | null) ?? null,
      nome: String(i.nome ?? ""),
      quantidade: Number(i.quantidade ?? 0),
      valor_unitario: Number(i.valor_unitario ?? 0),
      tipo: prod?.tipo ?? null,
      marca: prod?.marca ?? null,
    });
    porDeal.set(i.deal_id as string, arr);
  }

  return lista.map((d) => {
    const its = porDeal.get(d.id as string) ?? [];
    return {
      id: d.id as string,
      nome: String(d.nome ?? ""),
      empresa: (d.companies as { nome?: string } | null)?.nome ?? null,
      executivoId: (d.executivo_user_id as string | null) ?? null,
      // dia do ganho no calendário de Brasília ("YYYY-MM-DD")
      dataGanho: dataSP(String(d.ordem_compra_em ?? d.closed_at)),
      valor: Number(d.amount ?? 0),
      tipoVenda: (d.tipo_venda as string | null) ?? null,
      parcelas: (d.parcelas as number | null) ?? null,
      divisao: dividirNegocio(Number(d.amount ?? 0), its),
      itens: its.map((i) => ({
        nome: i.nome,
        tipo: i.tipo,
        marca: i.marca,
        total: Math.round(i.quantidade * i.valor_unitario * 100) / 100,
      })),
    };
  });
}

/** "2026-10" → ["2026-10-01", "2026-11-01"]. */
export function limitesDoMes(mes: string): [string, string] {
  const [a, m] = mes.split("-").map(Number);
  const fim = new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 10);
  return [`${mes}-01`, fim];
}
