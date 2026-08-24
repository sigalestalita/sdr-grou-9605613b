import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const saleSchema = z.object({
  id: z.string().uuid().optional(),
  clientUid: z.string().min(1),
  itemKind: z.enum(["produto", "servico"]).default("produto"),
  itemName: z.string().min(2),
  category: z.string().nullable().optional(),
  quantity: z.number().positive().default(1),
  unitValue: z.number().min(0).default(0),
  discount: z.number().min(0).default(0),
  totalValue: z.number().min(0).nullable().optional(),
  status: z.enum(["fechado", "em_negociacao", "cancelado", "renovacao"]).default("fechado"),
  recurrence: z.enum(["unica", "mensal", "trimestral", "semestral", "anual"]).default("unica"),
  saleDate: z.string().min(1),
  periodStart: z.string().nullable().optional(),
  periodEnd: z.string().nullable().optional(),
  contractRef: z.string().nullable().optional(),
  paymentMethod: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

/** Histórico de vendas (produtos e serviços) de um cliente. */
export const listCsSales = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ clientUid: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: sales, error } = await context.supabase
      .from("cs_sales")
      .select("*")
      .eq("client_uid", data.clientUid)
      .order("sale_date", { ascending: false });
    if (error) throw new Error(error.message);
    return { sales: sales ?? [] };
  });

/** Cria/edita uma venda e registra na timeline do cliente. */
export const saveCsSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => saleSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const computed =
      data.totalValue && data.totalValue > 0
        ? data.totalValue
        : Math.max(data.quantity * data.unitValue - data.discount, 0);

    const row = {
      client_uid: data.clientUid,
      item_kind: data.itemKind,
      item_name: data.itemName,
      category: data.category || null,
      quantity: data.quantity,
      unit_value: data.unitValue,
      discount: data.discount,
      total_value: computed,
      status: data.status,
      recurrence: data.recurrence,
      sale_date: data.saleDate,
      period_start: data.periodStart || null,
      period_end: data.periodEnd || null,
      contract_ref: data.contractRef || null,
      payment_method: data.paymentMethod || null,
      notes: data.notes || null,
      owner_user_id: userId,
    };

    let saleId = data.id ?? null;
    if (data.id) {
      const { error } = await supabase.from("cs_sales").update(row as never).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { data: created, error } = await supabase
        .from("cs_sales")
        .insert({ ...row, created_by: userId, source: "manual" } as never)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      saleId = (created as { id: string }).id;

      await supabase.from("cs_timeline_events").insert({
        client_uid: data.clientUid,
        author_id: userId,
        event_type: "venda",
        channel: "venda",
        title: `${data.itemKind === "produto" ? "Produto" : "Serviço"} vendido: ${data.itemName}`,
        description: data.notes || null,
        occurred_at: new Date(`${data.saleDate}T12:00:00`).toISOString(),
        metadata: { sale_id: saleId, total_value: computed, status: data.status },
      } as never);
    }

    return { ok: true, id: saleId };
  });

export const deleteCsSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("cs_sales").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
