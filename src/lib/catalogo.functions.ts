import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { podeFaturar } from "@/lib/faturamento/politica.server";
import { carregarPolitica } from "@/lib/faturamento/politica.server";
import { totalRetencaoPct } from "@/lib/faturamento/politica";
import { proposta, somarDivisoes, totalItens, type TipoItem } from "@/lib/catalogo/itens";
import { limitesDoMes, negociosGanhosNoPeriodo } from "@/lib/catalogo/realizado.server";

/*
 * Catálogo de produtos e serviços, itens do negócio e o realizado dividido.
 *
 * O catálogo é mantido pelo Administrativo (tabela de preço) e lido por todos.
 * Os itens do negócio são do comercial: com eles o valor do negócio deixa de
 * ser digitado e a divisão produto × serviço da meta sai sozinha.
 */

const solto = (s: unknown) => s as SupabaseClient;

export type Produto = {
  id: string;
  nome: string;
  marca: string | null;
  tipo: TipoItem | null;
  subcategoria: string | null;
  descricao: string | null;
  preco_tabela: number | null;
  parcelamento_max: number | null;
  ativo: boolean;
  ordem: number;
};

export const listarCatalogo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = solto(context.supabase);
    const [{ data, error }, podeEditar] = await Promise.all([
      db
        .from("products")
        .select(
          "id, nome, marca, tipo, subcategoria, descricao, preco_tabela, parcelamento_max, ativo, ordem",
        )
        .order("ordem")
        .order("nome")
        .limit(1000),
      podeFaturar(db, context.userId),
    ]);
    if (error) throw new Error(error.message);
    return {
      podeEditar,
      produtos: ((data ?? []) as Array<Record<string, unknown>>).map((p) => ({
        ...(p as unknown as Produto),
        preco_tabela: p.preco_tabela == null ? null : Number(p.preco_tabela),
      })),
    };
  });

export const salvarProduto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        nome: z.string().trim().min(2).max(120),
        marca: z.string().trim().max(40).nullable(),
        tipo: z.enum(["produto", "servico"]).nullable(),
        subcategoria: z.string().trim().max(60).nullable(),
        descricao: z.string().trim().max(1000).nullable(),
        preco_tabela: z.number().min(0).max(100_000_000).nullable(),
        parcelamento_max: z.number().int().min(1).max(24).nullable(),
        ativo: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    if (!(await podeFaturar(db, context.userId)))
      throw new Error("Só o Administrativo e a gestão mantêm o catálogo");
    const { id, ...campos } = data;
    const payload = { ...campos, updated_at: new Date().toISOString() };
    const { error } = id
      ? await db.from("products").update(payload).eq("id", id)
      : await db.from("products").insert(payload);
    if (error) {
      if (error.code === "23505") throw new Error("Já existe um item com esse nome");
      throw new Error(error.message);
    }
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Itens do negócio
// ---------------------------------------------------------------------------
export const getItensNegocio = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ dealId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const [{ data: deal }, { data: itens, error }] = await Promise.all([
      db
        .from("deals")
        .select("id, company_id, amount, valor_impostos, valor_liquido, status")
        .eq("id", data.dealId)
        .maybeSingle(),
      db
        .from("deal_products")
        .select(
          "id, product_id, nome, quantidade, valor_unitario, total, ordem, products:product_id(tipo, marca)",
        )
        .eq("deal_id", data.dealId)
        .order("ordem"),
    ]);
    if (error) throw new Error(error.message);
    if (!deal) throw new Error("Negócio não encontrado");
    const d = deal as Record<string, unknown>;
    // % de retenção da política do cliente, para sugerir os impostos.
    const pol = d.company_id ? await carregarPolitica(db, d.company_id as string) : null;
    return {
      valor: Number(d.amount ?? 0),
      valorImpostos: d.valor_impostos == null ? null : Number(d.valor_impostos),
      retencaoPct: pol ? totalRetencaoPct(pol.efetiva) : 0,
      itens: ((itens ?? []) as Array<Record<string, unknown>>).map((i) => ({
        product_id: (i.product_id as string | null) ?? null,
        nome: String(i.nome ?? ""),
        quantidade: Number(i.quantidade ?? 1),
        valor_unitario: Number(i.valor_unitario ?? 0),
        tipo: ((i.products as { tipo?: TipoItem | null } | null)?.tipo ?? null) as TipoItem | null,
        marca: (i.products as { marca?: string | null } | null)?.marca ?? null,
      })),
    };
  });

/**
 * Substitui os itens do negócio e recalcula o valor (soma dos itens), os
 * impostos e o valor final da proposta.
 */
export const salvarItensNegocio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        dealId: z.string().uuid(),
        itens: z
          .array(
            z.object({
              product_id: z.string().uuid().nullable(),
              nome: z.string().trim().min(1).max(160),
              quantidade: z.number().min(0.01).max(1_000_000),
              valor_unitario: z.number().min(0).max(100_000_000),
            }),
          )
          .max(60),
        valorImpostos: z.number().min(0).max(100_000_000).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const total = totalItens(data.itens);
    const p = proposta(total, data.valorImpostos);

    // Grava os novos antes de apagar os antigos: se a gravação falhar, o
    // negócio não fica sem itens.
    const { data: antigos } = await db
      .from("deal_products")
      .select("id")
      .eq("deal_id", data.dealId);
    if (data.itens.length > 0) {
      const { error } = await db.from("deal_products").insert(
        data.itens.map((i, idx) => ({
          deal_id: data.dealId,
          product_id: i.product_id,
          nome: i.nome,
          quantidade: i.quantidade,
          valor_unitario: i.valor_unitario,
          total: Math.round(i.quantidade * i.valor_unitario * 100) / 100,
          ordem: idx,
        })),
      );
      if (error) throw new Error(error.message);
    }
    const idsAntigos = ((antigos ?? []) as Array<{ id: string }>).map((a) => a.id);
    if (idsAntigos.length > 0) {
      const { error: delErr } = await db.from("deal_products").delete().in("id", idsAntigos);
      if (delErr) throw new Error(delErr.message);
    }
    const patch: Record<string, unknown> = {
      valor_impostos: data.valorImpostos == null ? null : p.impostos,
      valor_liquido: data.itens.length > 0 ? p.final : null,
      updated_at: new Date().toISOString(),
    };
    // Com itens, o valor do negócio é a soma deles.
    if (data.itens.length > 0) {
      patch.amount = total;
      patch.produtos_texto = data.itens.map((i) => `${i.quantidade}× ${i.nome}`).join(", ");
    }
    const { error } = await db.from("deals").update(patch).eq("id", data.dealId);
    if (error) throw new Error(error.message);
    return { ok: true, ...p };
  });

// ---------------------------------------------------------------------------
// Realizado dividido (tela de metas)
// ---------------------------------------------------------------------------
export const realizadoPorTipo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ mes: z.string().regex(/^\d{4}-\d{2}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = solto(context.supabase);
    const { data: isManager } = await db.rpc("is_manager", { _user_id: context.userId });
    const [ini, fim] = limitesDoMes(data.mes);
    // Gestão vê todo mundo; executivo vê o próprio.
    const negocios = await negociosGanhosNoPeriodo(db, ini, fim, isManager ? null : context.userId);
    const porExecutivo = new Map<string, typeof negocios>();
    for (const n of negocios) {
      const k = n.executivoId ?? "";
      porExecutivo.set(k, [...(porExecutivo.get(k) ?? []), n]);
    }
    return {
      porExecutivo: [...porExecutivo.entries()].map(([executivoId, ns]) => ({
        executivoId: executivoId || null,
        negocios: ns.length,
        ...somarDivisoes(ns.map((n) => n.divisao)),
      })),
    };
  });
