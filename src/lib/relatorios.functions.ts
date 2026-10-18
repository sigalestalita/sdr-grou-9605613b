import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { podeFaturar } from "@/lib/faturamento/politica.server";
import { agrupar, DIMENSOES, type LinhaBase } from "@/lib/relatorios/segmentos";

/*
 * Relatório segmentado (porte, tipo, status, produto × serviço, cidade, UF,
 * região, executivo), pela venda (data do ganho) ou pelo faturamento (notas
 * emitidas no período).
 */
const solto = (s: unknown) => s as SupabaseClient;

export const relatorioSegmentado = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        de: z.string().date(),
        ate: z.string().date(),
        base: z.enum(["venda", "faturamento"]),
        dimensao: z.enum(DIMENSOES.map((x) => x.v) as [string, ...string[]]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const { data: isManager } = await db.rpc("is_manager", { _user_id: context.userId });
    if (!isManager && !(await podeFaturar(db, context.userId)))
      throw new Error("Relatórios do faturamento são do ADM e da gestão");

    // fim inclusivo: até o fim do dia "ate"
    const fim = new Date(`${data.ate}T00:00:00Z`);
    fim.setUTCDate(fim.getUTCDate() + 1);
    const ate = fim.toISOString().slice(0, 10);

    // Negócios e o valor de cada um no período (venda ou nota emitida)
    const valorPorDeal = new Map<string, number>();
    if (data.base === "venda") {
      const { data: ds, error } = await db
        .from("deals")
        .select("id, amount")
        .eq("status", "won")
        .or(
          `and(ordem_compra_em.gte.${data.de},ordem_compra_em.lt.${ate}),and(ordem_compra_em.is.null,closed_at.gte.${data.de},closed_at.lt.${ate})`,
        )
        .limit(5000);
      if (error) throw new Error(error.message);
      for (const d of (ds ?? []) as Array<{ id: string; amount: number }>)
        valorPorDeal.set(d.id, Number(d.amount ?? 0));
    } else {
      const { data: fs, error } = await db
        .from("faturas")
        .select("deal_id, valor_bruto")
        .eq("status", "emitida")
        .gte("emitida_em", data.de)
        .lt("emitida_em", ate)
        .limit(5000);
      if (error) throw new Error(error.message);
      for (const f of (fs ?? []) as Array<{ deal_id: string; valor_bruto: number }>)
        valorPorDeal.set(f.deal_id, (valorPorDeal.get(f.deal_id) ?? 0) + Number(f.valor_bruto));
    }
    const ids = [...valorPorDeal.keys()];
    if (ids.length === 0) return { grupos: [], total: 0, negocios: 0 };

    const lotes: string[][] = [];
    for (let i = 0; i < ids.length; i += 300) lotes.push(ids.slice(i, i + 300));
    const deals: Array<Record<string, unknown>> = [];
    const itens: Array<Record<string, unknown>> = [];
    for (const lote of lotes) {
      const [{ data: ds }, { data: its }] = await Promise.all([
        db
          .from("deals")
          .select(
            "id, amount, tipo_venda, executivo_user_id, companies:company_id(porte, cidade, estado, lifecycle)",
          )
          .in("id", lote),
        db
          .from("deal_products")
          .select("deal_id, quantidade, valor_unitario, products:product_id(tipo, marca)")
          .in("deal_id", lote),
      ]);
      deals.push(...((ds ?? []) as Array<Record<string, unknown>>));
      itens.push(...((its ?? []) as Array<Record<string, unknown>>));
    }
    const { data: perfis } = await db.from("profiles").select("id, full_name, email");
    const nome = new Map(
      ((perfis ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>).map(
        (p) => [p.id, p.full_name || p.email || ""],
      ),
    );
    const itensPorDeal = new Map<string, Array<Record<string, unknown>>>();
    for (const i of itens)
      itensPorDeal.set(i.deal_id as string, [...(itensPorDeal.get(i.deal_id as string) ?? []), i]);

    const linhas: LinhaBase[] = deals.map((d) => {
      const c = d.companies as {
        porte?: string;
        cidade?: string;
        estado?: string;
        lifecycle?: string;
      } | null;
      const valor = valorPorDeal.get(d.id as string) ?? 0;
      const its = itensPorDeal.get(d.id as string) ?? [];
      const totalItens = its.reduce(
        (s, i) => s + Number(i.quantidade ?? 0) * Number(i.valor_unitario ?? 0),
        0,
      );
      // As partes (marca × tipo) seguem a proporção dos itens; sem itens, "sem tipo".
      const partes =
        its.length === 0 || totalItens <= 0
          ? [{ marca: null, tipo: null, valor }]
          : its.map((i) => {
              const p = i.products as { tipo?: "produto" | "servico"; marca?: string } | null;
              const peso = (Number(i.quantidade ?? 0) * Number(i.valor_unitario ?? 0)) / totalItens;
              return { marca: p?.marca ?? null, tipo: p?.tipo ?? null, valor: valor * peso };
            });
      return {
        porte: c?.porte ?? null,
        tipoVenda: (d.tipo_venda as string | null) ?? null,
        statusCliente: c?.lifecycle ?? null,
        cidade: c?.cidade ?? null,
        estado: c?.estado ?? null,
        executivo: nome.get(d.executivo_user_id as string) ?? null,
        partes,
      };
    });

    const grupos = agrupar(linhas, data.dimensao as never);
    return {
      grupos,
      total: Math.round([...valorPorDeal.values()].reduce((a, b) => a + b, 0) * 100) / 100,
      negocios: ids.length,
    };
  });
