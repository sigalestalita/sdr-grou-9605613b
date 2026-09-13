import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mesDe, type Meta, type Realizado } from "@/lib/comercial/metas";

/*
 * Módulo Comercial — leitura dos negócios, do funil e das metas.
 *
 * Roda sobre o esquema que a migração do RD já alimenta (companies, deals,
 * pipelines, pipeline_stages). O corte de venda ganha segue o que a gestora
 * definiu: vale a ordem de compra, não o aceite da proposta. Quando o negócio
 * veio do RD sem data de OC, cai no closed_at para não zerar o histórico.
 */

const PAGE = 1000;

type DealRow = {
  id: string;
  nome: string | null;
  company_id: string | null;
  executivo_user_id: string | null;
  sdr_user_id: string | null;
  pipeline_id: string | null;
  stage_id: string | null;
  status: string;
  amount: number | null;
  temperatura: string | null;
  fonte: string | null;
  campanha: string | null;
  reuniao_em: string | null;
  agendado_em: string | null;
  closed_at: string | null;
  ordem_compra_em: string | null;
  proposta_aceita_em: string | null;
  faturado_em: string | null;
  cs_entregue_em: string | null;
  adm_checked_at: string | null;
  esteira: string;
  lost_reason: string | null;
  created_at: string;
};

const DEAL_COLS =
  "id, nome, company_id, executivo_user_id, sdr_user_id, pipeline_id, stage_id, status, amount, temperatura, fonte, campanha, reuniao_em, agendado_em, closed_at, ordem_compra_em, proposta_aceita_em, faturado_em, cs_entregue_em, adm_checked_at, esteira, lost_reason, created_at";

/** Data que caracteriza a venda ganha, na regra da gestora. */
export function dataGanho(d: Pick<DealRow, "status" | "ordem_compra_em" | "closed_at">) {
  if (d.status !== "won") return null;
  return d.ordem_compra_em ?? d.closed_at ?? null;
}

const dentro = (iso: string | null | undefined, de: Date, ate: Date) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= de.getTime() && t < ate.getTime();
};

async function todosOsNegocios(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  filtros: { de: Date; ate: Date },
): Promise<DealRow[]> {
  const out: DealRow[] = [];
  // Traz o que foi criado, mexido ou fechado na janela, mais o que segue aberto.
  for (let page = 0; page < 40; page++) {
    const { data, error } = await supabase
      .from("deals")
      .select(DEAL_COLS)
      .or(
        `status.eq.open,created_at.gte.${filtros.de.toISOString()},closed_at.gte.${filtros.de.toISOString()}`,
      )
      .order("created_at", { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as DealRow[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

export type FunilEtapa = {
  stageId: string;
  nome: string;
  ordem: number;
  probabilidade: number;
  kind: string;
  quantidade: number;
  valor: number;
};

export type PessoaComercial = {
  id: string;
  nome: string;
  abertos: number;
  valorAberto: number;
  ganhos: number;
  valorGanho: number;
  perdidos: number;
  agendas: number;
  propostas: number;
  ticketMedio: number;
  conversao: number | null;
  meta: Meta | null;
  realizado: Realizado;
};

/** Painel do módulo comercial: funil, pessoas, esteira e metas. */
export const getComercialDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        from: z.string().datetime(),
        to: z.string().datetime(),
        pipelineId: z.string().uuid().optional(),
        executivoId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const de = new Date(data.from);
    const ate = new Date(data.to);

    const [{ data: isManager }, { data: pipelinesRaw }, { data: stagesRaw }, { data: profiles }] =
      await Promise.all([
        supabase.rpc("is_manager", { _user_id: userId }),
        supabase
          .from("pipelines")
          .select("id, nome, slug, tipo, ordem, ativo")
          .eq("tipo", "comercial")
          .order("ordem"),
        supabase
          .from("pipeline_stages")
          .select("id, pipeline_id, nome, slug, ordem, probabilidade, kind")
          .order("ordem"),
        supabase.from("profiles").select("id, full_name, email"),
      ]);

    const pipelines = (pipelinesRaw ?? []) as Array<{
      id: string;
      nome: string;
      slug: string;
      ordem: number;
      ativo: boolean;
    }>;
    const stages = (stagesRaw ?? []) as Array<{
      id: string;
      pipeline_id: string;
      nome: string;
      slug: string;
      ordem: number;
      probabilidade: number;
      kind: string;
    }>;
    const nomeDe = new Map(
      (profiles ?? []).map((p: { id: string; full_name: string | null; email: string | null }) => [
        p.id,
        p.full_name || p.email || p.id,
      ]),
    );

    // Quem não é gestão enxerga o próprio funil.
    const focoExecutivo = isManager ? (data.executivoId ?? null) : userId;

    let negocios = await todosOsNegocios(supabase, { de, ate });
    if (data.pipelineId) negocios = negocios.filter((d) => d.pipeline_id === data.pipelineId);
    const doFoco = focoExecutivo
      ? negocios.filter((d) => d.executivo_user_id === focoExecutivo)
      : negocios;

    // ---- funil por etapa (só o que está aberto) ----
    const stageById = new Map(stages.map((s) => [s.id, s]));
    const porEtapa = new Map<string, { quantidade: number; valor: number }>();
    for (const d of doFoco) {
      if (d.status !== "open" || !d.stage_id) continue;
      const atual = porEtapa.get(d.stage_id) ?? { quantidade: 0, valor: 0 };
      atual.quantidade += 1;
      atual.valor += Number(d.amount ?? 0);
      porEtapa.set(d.stage_id, atual);
    }
    const funil: FunilEtapa[] = stages
      .filter((s) => (data.pipelineId ? s.pipeline_id === data.pipelineId : true))
      .filter((s) => s.kind === "open")
      .map((s) => ({
        stageId: s.id,
        nome: s.nome,
        ordem: s.ordem,
        probabilidade: s.probabilidade,
        kind: s.kind,
        quantidade: porEtapa.get(s.id)?.quantidade ?? 0,
        valor: porEtapa.get(s.id)?.valor ?? 0,
      }))
      .sort((a, b) => a.ordem - b.ordem);

    // ---- metas do período ----
    const { chave } = mesDe(de);
    const { data: metasRaw } = await supabase
      .from("commercial_goals")
      .select("user_id, meta_valor, meta_quantidade, meta_agendas, meta_propostas, meta_contatos")
      .eq("periodo", chave)
      .is("pipeline_id", null);
    const metaDe = new Map(
      (metasRaw ?? []).map((m: Record<string, unknown>) => [
        m.user_id as string,
        {
          meta_valor: Number(m.meta_valor ?? 0),
          meta_quantidade: Number(m.meta_quantidade ?? 0),
          meta_agendas: (m.meta_agendas as number | null) ?? null,
          meta_propostas: (m.meta_propostas as number | null) ?? null,
          meta_contatos: (m.meta_contatos as number | null) ?? null,
        } satisfies Meta,
      ]),
    );

    // ---- uma linha por executivo ----
    const ids = new Set<string>();
    for (const d of negocios) if (d.executivo_user_id) ids.add(d.executivo_user_id);
    for (const id of metaDe.keys()) ids.add(id);

    const stageProposta = new Set(
      stages.filter((s) => /proposta/i.test(s.slug) || /proposta/i.test(s.nome)).map((s) => s.id),
    );

    const pessoas: PessoaComercial[] = [...ids]
      .map((id) => {
        const meus = negocios.filter((d) => d.executivo_user_id === id);
        const abertosList = meus.filter((d) => d.status === "open");
        const ganhosList = meus.filter((d) => dentro(dataGanho(d), de, ate));
        const perdidosList = meus.filter(
          (d) => d.status === "lost" && dentro(d.closed_at, de, ate),
        );
        const agendas = meus.filter(
          (d) => dentro(d.reuniao_em, de, ate) || dentro(d.agendado_em, de, ate),
        ).length;
        const propostas = meus.filter(
          (d) =>
            dentro(d.proposta_aceita_em, de, ate) ||
            (d.status === "open" && d.stage_id && stageProposta.has(d.stage_id)),
        ).length;
        const valorGanho = ganhosList.reduce((a, d) => a + Number(d.amount ?? 0), 0);
        const decididos = ganhosList.length + perdidosList.length;
        return {
          id,
          nome: nomeDe.get(id) ?? id,
          abertos: abertosList.length,
          valorAberto: abertosList.reduce((a, d) => a + Number(d.amount ?? 0), 0),
          ganhos: ganhosList.length,
          valorGanho,
          perdidos: perdidosList.length,
          agendas,
          propostas,
          ticketMedio: ganhosList.length ? Math.round(valorGanho / ganhosList.length) : 0,
          conversao: decididos ? Math.round((ganhosList.length / decididos) * 100) : null,
          meta: metaDe.get(id) ?? null,
          realizado: {
            valor: valorGanho,
            quantidade: ganhosList.length,
            agendas,
            propostas,
            contatos: 0,
          } satisfies Realizado,
        };
      })
      .sort((a, b) => b.valorGanho - a.valorGanho);

    // ---- esteira entre áreas ----
    const esteira = { comercial: 0, faturamento: 0, cs: 0, concluido: 0 } as Record<string, number>;
    for (const d of doFoco) {
      if (d.status !== "won") continue;
      esteira[d.esteira] = (esteira[d.esteira] ?? 0) + 1;
    }

    // ---- qualidade do corte de fechamento ----
    const ganhosNoPeriodo = doFoco.filter((d) => dentro(dataGanho(d), de, ate));
    const semOrdemCompra = ganhosNoPeriodo.filter((d) => !d.ordem_compra_em).length;

    const totalGanho = ganhosNoPeriodo.reduce((a, d) => a + Number(d.amount ?? 0), 0);
    const abertosFoco = doFoco.filter((d) => d.status === "open");

    return {
      isManager: !!isManager,
      foco: focoExecutivo ? { id: focoExecutivo, nome: nomeDe.get(focoExecutivo) ?? "" } : null,
      pipelines,
      resumo: {
        abertos: abertosFoco.length,
        valorAberto: abertosFoco.reduce((a, d) => a + Number(d.amount ?? 0), 0),
        ganhos: ganhosNoPeriodo.length,
        valorGanho: totalGanho,
        ticketMedio: ganhosNoPeriodo.length ? Math.round(totalGanho / ganhosNoPeriodo.length) : 0,
        perdidos: doFoco.filter((d) => d.status === "lost" && dentro(d.closed_at, de, ate)).length,
        agendas: doFoco.filter(
          (d) => dentro(d.reuniao_em, de, ate) || dentro(d.agendado_em, de, ate),
        ).length,
        semOrdemCompra,
      },
      funil,
      pessoas,
      esteira,
      stagesById: Object.fromEntries(stages.map((s) => [s.id, stageById.get(s.id)?.nome ?? ""])),
    };
  });

/** Negócios de um pipeline, para o kanban comercial. */
export const listComercialDeals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        pipelineId: z.string().uuid().optional(),
        executivoId: z.string().uuid().optional(),
        somenteAbertos: z.boolean().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [{ data: pipelinesRaw }, { data: stagesRaw }, { data: profiles }] = await Promise.all([
      supabase
        .from("pipelines")
        .select("id, nome, slug, ordem")
        .eq("tipo", "comercial")
        .order("ordem"),
      supabase
        .from("pipeline_stages")
        .select("id, pipeline_id, nome, slug, ordem, probabilidade, kind")
        .order("ordem"),
      supabase.from("profiles").select("id, full_name, email"),
    ]);
    const pipelines = (pipelinesRaw ?? []) as Array<{ id: string; nome: string; slug: string }>;
    const alvo = data.pipelineId ?? pipelines[0]?.id ?? null;

    let q = supabase
      .from("deals")
      .select(`${DEAL_COLS}, companies:company_id(id, nome)`)
      .order("updated_at", { ascending: false })
      .limit(600);
    if (alvo) q = q.eq("pipeline_id", alvo);
    if (data.executivoId) q = q.eq("executivo_user_id", data.executivoId);
    if (data.somenteAbertos !== false) q = q.eq("status", "open");
    const { data: deals, error } = await q;
    if (error) throw new Error(error.message);

    return {
      pipelines,
      pipelineId: alvo,
      stages: ((stagesRaw ?? []) as Array<{ pipeline_id: string }>).filter(
        (s) => s.pipeline_id === alvo,
      ),
      deals: deals ?? [],
      profiles: profiles ?? [],
    };
  });

// ---------------------------------------------------------------------------
// Metas
// ---------------------------------------------------------------------------
export const listMetasComerciais = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ periodo: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [{ data: isManager }, { data: metas }, { data: profiles }, { data: cfg }] =
      await Promise.all([
        supabase.rpc("is_manager", { _user_id: userId }),
        supabase.from("commercial_goals").select("*").eq("periodo", data.periodo),
        supabase.from("profiles").select("id, full_name, email").order("full_name"),
        supabase.from("app_settings").select("value").eq("key", "comercial").maybeSingle(),
      ]);
    const conf = (cfg?.value ?? {}) as { ticket_medio?: number };
    return {
      isManager: !!isManager,
      metas: metas ?? [],
      profiles: profiles ?? [],
      ticketMedio: Number(conf.ticket_medio ?? 4500),
    };
  });

export const salvarMetaComercial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        userId: z.string().uuid(),
        periodo: z.string().regex(/^\d{4}-\d{2}-01$/),
        escopo: z.enum(["novos", "carteira", "ambos"]).default("novos"),
        meta_valor: z.number().min(0).max(100_000_000),
        meta_quantidade: z.number().int().min(0).max(10_000),
        meta_agendas: z.number().int().min(0).max(10_000).nullable().optional(),
        meta_propostas: z.number().int().min(0).max(10_000).nullable().optional(),
        meta_contatos: z.number().int().min(0).max(100_000).nullable().optional(),
        observacao: z.string().max(500).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isManager } = await supabase.rpc("is_manager", { _user_id: userId });
    if (!isManager) throw new Error("Apenas a gestão define metas");

    const { error } = await supabase.from("commercial_goals").upsert(
      {
        user_id: data.userId,
        periodo: data.periodo,
        escopo: data.escopo,
        pipeline_id: null,
        meta_valor: data.meta_valor,
        meta_quantidade: data.meta_quantidade,
        meta_agendas: data.meta_agendas ?? null,
        meta_propostas: data.meta_propostas ?? null,
        meta_contatos: data.meta_contatos ?? null,
        observacao: data.observacao ?? null,
        updated_at: new Date().toISOString(),
        created_by: userId,
      } as never,
      { onConflict: "user_id,periodo,escopo,pipeline_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removerMetaComercial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isManager } = await supabase.rpc("is_manager", { _user_id: userId });
    if (!isManager) throw new Error("Apenas a gestão define metas");
    const { error } = await supabase.from("commercial_goals").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
