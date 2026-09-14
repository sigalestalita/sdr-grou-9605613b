import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
 * A ponte da carteira: o CS sinaliza, o executivo abre.
 *
 * A oportunidade na base nasce no CS — é o analista que percebe que os
 * créditos acabaram ou que existe uma dor que outro produto resolve. Quem abre
 * e trabalha o negócio é o executivo de carteira, para o número ficar com quem
 * vende.
 */

/** Qual funil cada tipo de sinalização abre. */
export const FUNIL_POR_TIPO: Record<string, string> = {
  // Já usa e vai comprar mais do mesmo: funil curto, não há o que descobrir.
  recompra: "up-sell-recompra",
  // Produto que ainda não tem: funil longo, com agenda de necessidade e pesquisa.
  cross_sell: "cross-sell-cliente",
  // Renovação do contrato entra no de recompra até existir funil próprio.
  renovacao: "up-sell-recompra",
};

export const TIPOS_OPORTUNIDADE = [
  {
    valor: "recompra",
    rotulo: "Recompra",
    ajuda: "O cliente já usa e vai comprar mais do mesmo. Créditos acabando, licença maior.",
  },
  {
    valor: "cross_sell",
    rotulo: "Cross sell",
    ajuda: "Outro produto ou serviço do portfólio, que o cliente ainda não tem.",
  },
  {
    valor: "renovacao",
    rotulo: "Renovação",
    ajuda: "Renovação do contrato, nos dois últimos meses da jornada.",
  },
] as const;

/** O analista de CS sinaliza a oportunidade. */
export const sinalizarOportunidade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        clientUid: z.string().min(1),
        tipo: z.enum(["recompra", "cross_sell", "renovacao"]),
        motivo: z.string().min(3).max(1000),
        produtoSugerido: z.string().max(200).nullable().optional(),
        valorEstimado: z.number().min(0).max(100_000_000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { error } = await supabase.from("cs_oportunidades").insert({
      client_uid: data.clientUid,
      tipo: data.tipo,
      motivo: data.motivo.trim(),
      produto_sugerido: data.produtoSugerido?.trim() || null,
      valor_estimado: data.valorEstimado ?? null,
      sinalizada_por: userId,
    } as never);
    if (error) throw new Error(error.message);

    // Fica na linha do tempo do cliente, para o CS ver o que já sinalizou.
    await supabase.from("cs_timeline_events").insert({
      client_uid: data.clientUid,
      author_id: userId,
      event_type: "nota",
      title: `Oportunidade sinalizada ao comercial (${data.tipo === "cross_sell" ? "cross sell" : data.tipo})`,
      description: data.motivo.trim(),
      occurred_at: new Date().toISOString(),
    } as never);

    return { ok: true };
  });

/** Sinalizações de um cliente, para a ficha dele no CS. */
export const listOportunidadesDoCliente = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ clientUid: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [{ data: rows, error }, { data: profiles }] = await Promise.all([
      supabase
        .from("cs_oportunidades")
        .select("*")
        .eq("client_uid", data.clientUid)
        .order("sinalizada_em", { ascending: false }),
      supabase.from("profiles").select("id, full_name, email"),
    ]);
    if (error) throw new Error(error.message);
    const nomeDe = new Map(
      (profiles ?? []).map((p: { id: string; full_name: string | null; email: string | null }) => [
        p.id,
        p.full_name || p.email || p.id,
      ]),
    );
    return {
      oportunidades: (rows ?? []).map((o) => ({
        id: o.id as string,
        tipo: o.tipo as string,
        motivo: o.motivo as string,
        produtoSugerido: (o.produto_sugerido as string | null) ?? null,
        valorEstimado: o.valor_estimado == null ? null : Number(o.valor_estimado),
        status: o.status as string,
        sinalizadaEm: o.sinalizada_em as string,
        sinalizadaPor: nomeDe.get(o.sinalizada_por as string) ?? null,
        assumidaPor: nomeDe.get(o.assumida_por as string) ?? null,
        dealId: (o.deal_id as string | null) ?? null,
      })),
    };
  });

/** A fila do executivo de carteira: o que o CS sinalizou e ninguém assumiu. */
export const listOportunidadesAbertas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [{ data: rows, error }, { data: profiles }] = await Promise.all([
      supabase
        .from("cs_oportunidades")
        .select("*, cs_clients:client_uid(nome_empresa, company_id, cs_responsavel_id)")
        .eq("status", "aberta")
        .order("sinalizada_em", { ascending: false })
        .limit(100),
      supabase.from("profiles").select("id, full_name, email"),
    ]);
    if (error) throw new Error(error.message);
    const nomeDe = new Map(
      (profiles ?? []).map((p: { id: string; full_name: string | null; email: string | null }) => [
        p.id,
        p.full_name || p.email || p.id,
      ]),
    );
    return {
      oportunidades: (rows ?? []).map((o) => {
        const cliente = o.cs_clients as {
          nome_empresa?: string;
          company_id?: string | null;
          cs_responsavel_id?: string | null;
        } | null;
        return {
          id: o.id as string,
          clientUid: o.client_uid as string,
          empresa: cliente?.nome_empresa ?? (o.client_uid as string),
          tipo: o.tipo as string,
          motivo: o.motivo as string,
          produtoSugerido: (o.produto_sugerido as string | null) ?? null,
          valorEstimado: o.valor_estimado == null ? null : Number(o.valor_estimado),
          sinalizadaEm: o.sinalizada_em as string,
          sinalizadaPor: nomeDe.get(o.sinalizada_por as string) ?? null,
          analistaCs: nomeDe.get(cliente?.cs_responsavel_id as string) ?? null,
        };
      }),
    };
  });

/**
 * O executivo assume: cria o negócio no funil que o tipo determina, na
 * primeira etapa, e amarra tudo à mesma empresa que os módulos compartilham.
 */
export const assumirOportunidade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        nome: z.string().min(2).max(200).optional(),
        valor: z.number().min(0).max(100_000_000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: op, error: opErr } = await supabase
      .from("cs_oportunidades")
      .select("*, cs_clients:client_uid(nome_empresa, company_id)")
      .eq("id", data.id)
      .maybeSingle();
    if (opErr) throw new Error(opErr.message);
    if (!op) throw new Error("Oportunidade não encontrada");
    if (op.status !== "aberta") throw new Error("Esta oportunidade já foi tratada");

    const cliente = op.cs_clients as { nome_empresa?: string; company_id?: string | null } | null;
    const slug = FUNIL_POR_TIPO[op.tipo as string] ?? "up-sell-recompra";

    const { data: pipeline } = await supabase
      .from("pipelines")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!pipeline) throw new Error(`Funil "${slug}" não encontrado`);

    const { data: etapa } = await supabase
      .from("pipeline_stages")
      .select("id")
      .eq("pipeline_id", pipeline.id)
      .eq("kind", "open")
      .order("ordem")
      .limit(1)
      .maybeSingle();

    const { data: negocio, error: dealErr } = await supabase
      .from("deals")
      .insert({
        nome:
          data.nome?.trim() ||
          `${op.produto_sugerido || (op.tipo === "cross_sell" ? "Cross sell" : "Recompra")} — ${cliente?.nome_empresa ?? op.client_uid}`,
        company_id: cliente?.company_id ?? null,
        executivo_user_id: userId,
        pipeline_id: pipeline.id,
        stage_id: etapa?.id ?? null,
        status: "open",
        amount: data.valor ?? Number(op.valor_estimado ?? 0),
        fonte: "Sinalização do CS",
        tipo_venda: op.tipo === "cross_sell" ? "Cross sell" : "Recompra",
        produtos_texto: (op.produto_sugerido as string | null) ?? null,
      } as never)
      .select("id")
      .single();
    if (dealErr) throw new Error(dealErr.message);
    const dealId = (negocio as { id: string }).id;

    const agora = new Date().toISOString();
    await supabase
      .from("cs_oportunidades")
      .update({
        status: "assumida",
        assumida_por: userId,
        assumida_em: agora,
        deal_id: dealId,
        updated_at: agora,
      } as never)
      .eq("id", data.id);

    // O contexto que o CS deu abre o histórico do negócio.
    await supabase.from("deal_activities").insert({
      deal_id: dealId,
      tipo: "nota",
      descricao: `Oportunidade sinalizada pelo CS: ${op.motivo}`,
      author_id: userId,
      occurred_at: agora,
    } as never);

    return { ok: true, dealId };
  });

export const descartarOportunidade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), motivo: z.string().min(2).max(300) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("cs_oportunidades")
      .update({
        status: "descartada",
        descartada_motivo: data.motivo.trim(),
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
