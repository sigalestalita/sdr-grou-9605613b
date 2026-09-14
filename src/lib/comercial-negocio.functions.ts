import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
 * O que o executivo comercial roda no dia a dia.
 *
 * O módulo nasceu só com leitura — funil, metas, análise. Aqui está a parte de
 * execução: abrir o negócio, registrar o que foi feito, combinar o próximo
 * passo, mover de etapa e fechar. Cada atividade registrada também é o que
 * alimenta o histórico de follow-up que a gestão pediu.
 */

export const TIPOS_ATIVIDADE = [
  { valor: "ligacao", rotulo: "Ligação" },
  { valor: "email", rotulo: "E-mail" },
  { valor: "reuniao", rotulo: "Reunião" },
  { valor: "whatsapp", rotulo: "WhatsApp" },
  { valor: "proposta", rotulo: "Proposta" },
  { valor: "nota", rotulo: "Anotação" },
] as const;

const DEAL_COLS =
  "id, nome, company_id, contact_id, executivo_user_id, sdr_user_id, pipeline_id, stage_id, status, amount, temperatura, fonte, campanha, tipo_venda, categoria_venda, produtos_texto, observacao_adm, proximo_passo, proximo_passo_em, reuniao_em, agendado_em, devolutiva_em, proposta_aceita_em, ordem_compra_em, ordem_compra_numero, contrato_assinado_em, adm_checked_at, faturado_em, cs_entregue_em, closed_at, lost_reason, esteira, created_at, updated_at";

/** Ficha do negócio: dados, etapas possíveis e histórico. */
export const getNegocio = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: negocio, error } = await supabase
      .from("deals")
      .select(
        `${DEAL_COLS}, companies:company_id(id, nome, segmento, num_funcionarios, cidade, estado)`,
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!negocio) throw new Error("Negócio não encontrado");

    const [{ data: etapas }, { data: atividades }, { data: profiles }] = await Promise.all([
      supabase
        .from("pipeline_stages")
        .select("id, pipeline_id, nome, slug, ordem, probabilidade, kind")
        .eq("pipeline_id", negocio.pipeline_id ?? "")
        .order("ordem"),
      supabase
        .from("deal_activities")
        .select("id, tipo, descricao, occurred_at, author_id, de_stage_id, para_stage_id")
        .eq("deal_id", data.id)
        .order("occurred_at", { ascending: false })
        .limit(120),
      supabase.from("profiles").select("id, full_name, email"),
    ]);

    const nomeDe = new Map(
      (profiles ?? []).map((p: { id: string; full_name: string | null; email: string | null }) => [
        p.id,
        p.full_name || p.email || p.id,
      ]),
    );
    const nomeEtapa = new Map(
      ((etapas ?? []) as Array<{ id: string; nome: string }>).map((e) => [e.id, e.nome]),
    );

    return {
      negocio,
      etapas: etapas ?? [],
      executivoNome: nomeDe.get(negocio.executivo_user_id as string) ?? null,
      sdrNome: nomeDe.get(negocio.sdr_user_id as string) ?? null,
      atividades: (atividades ?? []).map((a) => ({
        id: a.id as string,
        tipo: a.tipo as string,
        descricao: (a.descricao as string | null) ?? null,
        occurredAt: a.occurred_at as string,
        autor: nomeDe.get(a.author_id as string) ?? null,
        deEtapa: nomeEtapa.get(a.de_stage_id as string) ?? null,
        paraEtapa: nomeEtapa.get(a.para_stage_id as string) ?? null,
      })),
    };
  });

/**
 * Registra o que foi feito e, no mesmo gesto, combina o próximo passo. Juntar
 * as duas coisas é o que evita negócio parado sem ninguém perceber.
 */
export const registrarAtividade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        dealId: z.string().uuid(),
        tipo: z.enum(["ligacao", "email", "reuniao", "whatsapp", "proposta", "nota"]),
        descricao: z.string().max(2000).optional(),
        occurredAt: z.string().datetime().optional(),
        proximoPasso: z.string().max(300).nullable().optional(),
        proximoPassoEm: z.string().datetime().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { error } = await supabase.from("deal_activities").insert({
      deal_id: data.dealId,
      tipo: data.tipo,
      descricao: data.descricao?.trim() || null,
      occurred_at: data.occurredAt ?? new Date().toISOString(),
      author_id: userId,
    } as never);
    if (error) throw new Error(error.message);

    // Próximo passo só é tocado quando veio no formulário.
    if (data.proximoPasso !== undefined || data.proximoPassoEm !== undefined) {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (data.proximoPasso !== undefined) patch.proximo_passo = data.proximoPasso || null;
      if (data.proximoPassoEm !== undefined) patch.proximo_passo_em = data.proximoPassoEm || null;
      const { error: upErr } = await supabase
        .from("deals")
        .update(patch as never)
        .eq("id", data.dealId);
      if (upErr) throw new Error(upErr.message);
    }

    // Reunião registrada alimenta a métrica de agendas da meta.
    if (data.tipo === "reuniao") {
      await supabase
        .from("deals")
        .update({ reuniao_em: data.occurredAt ?? new Date().toISOString() } as never)
        .eq("id", data.dealId)
        .is("reuniao_em", null);
    }

    return { ok: true };
  });

export const moverEtapa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ dealId: z.string().uuid(), stageId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // A mudança vira atividade sozinha, por trigger no banco.
    const { error } = await supabase
      .from("deals")
      .update({ stage_id: data.stageId, updated_at: new Date().toISOString() } as never)
      .eq("id", data.dealId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Edita os campos que o executivo mexe com frequência. */
export const salvarNegocio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        nome: z.string().min(1).max(200).optional(),
        amount: z.number().min(0).max(100_000_000).optional(),
        temperatura: z.enum(["quente", "morno", "frio"]).nullable().optional(),
        tipo_venda: z.string().max(120).nullable().optional(),
        produtos_texto: z.string().max(1000).nullable().optional(),
        proximo_passo: z.string().max(300).nullable().optional(),
        proximo_passo_em: z.string().datetime().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { id, ...campos } = data;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [k, v] of Object.entries(campos)) if (v !== undefined) patch[k] = v;
    const { error } = await supabase
      .from("deals")
      .update(patch as never)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Fecha o negócio. Ganho exige a ordem de compra, que é a regra da gestão:
 * aceite de proposta não é venda, e é daí que vinha a diferença entre o número
 * dela e o do financeiro.
 */
export const fecharNegocio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .discriminatedUnion("resultado", [
        z.object({
          resultado: z.literal("ganho"),
          dealId: z.string().uuid(),
          ordemCompraEm: z.string().datetime(),
          ordemCompraNumero: z.string().min(1).max(60),
          contratoAssinadoEm: z.string().datetime().nullable().optional(),
          amount: z.number().min(0).max(100_000_000).optional(),
          observacaoAdm: z.string().max(4000).optional(),
        }),
        z.object({
          resultado: z.literal("perdido"),
          dealId: z.string().uuid(),
          motivo: z.string().min(2).max(300),
        }),
      ])
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const agora = new Date().toISOString();

    const { data: etapas } = await supabase
      .from("pipeline_stages")
      .select("id, kind, pipeline_id")
      .eq("kind", data.resultado === "ganho" ? "won" : "lost");
    const { data: negocio } = await supabase
      .from("deals")
      .select("pipeline_id")
      .eq("id", data.dealId)
      .maybeSingle();
    const etapaFinal =
      ((etapas ?? []) as Array<{ id: string; pipeline_id: string }>).find(
        (e) => e.pipeline_id === negocio?.pipeline_id,
      )?.id ?? null;

    const patch: Record<string, unknown> =
      data.resultado === "ganho"
        ? {
            status: "won",
            ordem_compra_em: data.ordemCompraEm,
            ordem_compra_numero: data.ordemCompraNumero,
            contrato_assinado_em: data.contratoAssinadoEm ?? null,
            closed_at: data.ordemCompraEm,
            ...(data.amount !== undefined ? { amount: data.amount } : {}),
            ...(data.observacaoAdm ? { observacao_adm: data.observacaoAdm } : {}),
            proximo_passo: null,
            proximo_passo_em: null,
          }
        : {
            status: "lost",
            lost_reason: data.motivo,
            closed_at: agora,
            proximo_passo: null,
            proximo_passo_em: null,
          };
    if (etapaFinal) patch.stage_id = etapaFinal;
    patch.updated_at = agora;

    const { error } = await supabase
      .from("deals")
      .update(patch as never)
      .eq("id", data.dealId);
    if (error) throw new Error(error.message);

    await supabase.from("deal_activities").insert({
      deal_id: data.dealId,
      tipo: "nota",
      descricao:
        data.resultado === "ganho"
          ? `Venda ganha — ordem de compra ${data.ordemCompraNumero}. Segue para o ADM.`
          : `Negócio perdido — ${data.motivo}`,
      author_id: userId,
    } as never);

    return { ok: true };
  });

/**
 * A fila do executivo: o que ele combinou de fazer e ainda não fez, atrasado
 * primeiro. É a tela que substitui a planilha pessoal.
 */
export const minhaFilaComercial = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        executivoId: z.string().uuid().optional(),
        dias: z.number().int().min(1).max(60).default(7),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isManager } = await supabase.rpc("is_manager", { _user_id: userId });
    const alvo = isManager && data.executivoId ? data.executivoId : userId;

    const limite = new Date();
    limite.setHours(23, 59, 59, 999);
    limite.setDate(limite.getDate() + data.dias);

    const [{ data: comPasso }, { data: semPasso }] = await Promise.all([
      supabase
        .from("deals")
        .select(
          `id, nome, amount, proximo_passo, proximo_passo_em, stage_id, companies:company_id(nome)`,
        )
        .eq("executivo_user_id", alvo)
        .eq("status", "open")
        .not("proximo_passo_em", "is", null)
        .lte("proximo_passo_em", limite.toISOString())
        .order("proximo_passo_em"),
      // Negócio aberto sem próximo passo é o que some do radar.
      supabase
        .from("deals")
        .select(`id, nome, amount, stage_id, updated_at, companies:company_id(nome)`)
        .eq("executivo_user_id", alvo)
        .eq("status", "open")
        .is("proximo_passo_em", null)
        .order("updated_at", { ascending: true })
        .limit(20),
    ]);

    const agora = Date.now();
    return {
      isManager: !!isManager,
      alvo,
      fila: (comPasso ?? []).map((d) => ({
        id: d.id as string,
        nome: (d.nome as string) ?? "",
        empresa: (d.companies as { nome?: string } | null)?.nome ?? null,
        amount: Number(d.amount ?? 0),
        proximoPasso: (d.proximo_passo as string | null) ?? null,
        quando: d.proximo_passo_em as string,
        atrasado: new Date(d.proximo_passo_em as string).getTime() < agora,
      })),
      semProximoPasso: (semPasso ?? []).map((d) => ({
        id: d.id as string,
        nome: (d.nome as string) ?? "",
        empresa: (d.companies as { nome?: string } | null)?.nome ?? null,
        amount: Number(d.amount ?? 0),
        paradoDesde: d.updated_at as string,
      })),
    };
  });
