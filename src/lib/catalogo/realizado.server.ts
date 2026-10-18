import type { SupabaseClient } from "@supabase/supabase-js";
import { dividirNegocio, type Divisao, type ItemNegocio, type TipoItem } from "./itens";

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
  dataGanho: string;
  valor: number;
  tipoVenda: string | null;
  divisao: Divisao;
  itens: Array<{ nome: string; tipo: TipoItem | null; marca: string | null; total: number }>;
};

export async function negociosGanhosNoPeriodo(
  db: SupabaseClient,
  ini: string,
  fim: string,
  executivoId?: string | null,
): Promise<NegocioRealizado[]> {
  // ordem_compra_em no período, ou (sem OC) closed_at no período.
  let q = db
    .from("deals")
    .select(
      "id, nome, amount, executivo_user_id, ordem_compra_em, closed_at, tipo_venda, companies:company_id(nome)",
    )
    .eq("status", "won")
    .or(
      `and(ordem_compra_em.gte.${ini},ordem_compra_em.lt.${fim}),and(ordem_compra_em.is.null,closed_at.gte.${ini},closed_at.lt.${fim})`,
    )
    .limit(2000);
  if (executivoId) q = q.eq("executivo_user_id", executivoId);
  const { data: deals, error } = await q;
  if (error) throw new Error(error.message);
  const lista = (deals ?? []) as Array<Record<string, unknown>>;
  if (lista.length === 0) return [];

  const { data: itens, error: iErr } = await db
    .from("deal_products")
    .select(
      "deal_id, nome, quantidade, valor_unitario, product_id, products:product_id(tipo, marca)",
    )
    .in(
      "deal_id",
      lista.map((d) => d.id as string),
    );
  if (iErr) throw new Error(iErr.message);

  const porDeal = new Map<string, Array<ItemNegocio & { marca: string | null }>>();
  for (const i of (itens ?? []) as Array<Record<string, unknown>>) {
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
      dataGanho: String(d.ordem_compra_em ?? d.closed_at ?? ""),
      valor: Number(d.amount ?? 0),
      tipoVenda: (d.tipo_venda as string | null) ?? null,
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
