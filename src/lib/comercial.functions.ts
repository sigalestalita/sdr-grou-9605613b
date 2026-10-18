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

    /*
     * Atividade registrada por pessoa no período: é o "quantos e-mails, quantas
     * ligações" do briefing, e o que fecha a micrometa de contatos. Tolera a
     * migration de execução ainda não aplicada.
     */
    const contatosPorPessoa = new Map<string, number>();
    try {
      const { data: atividades } = await supabase
        .from("deal_activities")
        .select("author_id")
        .neq("tipo", "etapa")
        .gte("occurred_at", de.toISOString())
        .lt("occurred_at", ate.toISOString())
        .limit(20000);
      for (const a of atividades ?? []) {
        const id = a.author_id as string | null;
        if (!id) continue;
        contatosPorPessoa.set(id, (contatosPorPessoa.get(id) ?? 0) + 1);
      }
    } catch {
      // sem a tabela ainda, a micrometa de contatos fica zerada
    }

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
            contatos: contatosPorPessoa.get(id) ?? 0,
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
    const conf = (cfg?.value ?? {}) as {
      ticket_medio?: number;
      meta_faturamento_mensal?: number;
      meta_base?: string;
    };
    return {
      isManager: !!isManager,
      metas: metas ?? [],
      profiles: profiles ?? [],
      ticketMedio: Number(conf.ticket_medio ?? 4500),
      metaEmpresa: Number(conf.meta_faturamento_mensal ?? 775000),
      metaBase: conf.meta_base === "venda" ? ("venda" as const) : ("faturamento" as const),
    };
  });

/**
 * Meta mensal da empresa inteira, que é o número da tela inicial da gestão.
 *
 * A base é escolhida aqui porque as duas leituras existem e não dão o mesmo
 * número: a venda conta na ordem de compra, o faturamento conta dias depois,
 * quando o ADM fatura.
 */
export const salvarMetaDaEmpresa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        valor: z.number().min(0).max(1_000_000_000),
        base: z.enum(["faturamento", "venda"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isManager } = await supabase.rpc("is_manager", { _user_id: userId });
    if (!isManager) throw new Error("Apenas a gestão define a meta da empresa");

    const { data: atual } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "comercial")
      .maybeSingle();
    const value = {
      ...((atual?.value ?? {}) as Record<string, unknown>),
      meta_faturamento_mensal: data.valor,
      meta_base: data.base,
    };
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: "comercial", value, updated_at: new Date().toISOString() } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
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
        // Meta dividida (comissão é separada em produto e serviço).
        meta_produto: z.number().min(0).max(100_000_000).nullable().optional(),
        meta_servico: z.number().min(0).max(100_000_000).nullable().optional(),
        observacao: z.string().max(500).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isManager } = await supabase.rpc("is_manager", { _user_id: userId });
    if (!isManager) throw new Error("Apenas a gestão define metas");
    // Com a meta dividida, a de valor é a soma das duas.
    const dividida = data.meta_produto != null || data.meta_servico != null;
    const metaValor = dividida
      ? (data.meta_produto ?? 0) + (data.meta_servico ?? 0)
      : data.meta_valor;

    const { error } = await supabase.from("commercial_goals").upsert(
      {
        user_id: data.userId,
        periodo: data.periodo,
        escopo: data.escopo,
        pipeline_id: null,
        meta_valor: metaValor,
        meta_produto: data.meta_produto ?? null,
        meta_servico: data.meta_servico ?? null,
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

// ---------------------------------------------------------------------------
// Análise comercial
// ---------------------------------------------------------------------------

/** Colunas que só existem depois da migration do módulo comercial. */
const COLS_NOVAS =
  "ordem_compra_em, proposta_aceita_em, faturado_em, cs_entregue_em, adm_checked_at, esteira";
const COLS_BASE =
  "id, nome, company_id, executivo_user_id, sdr_user_id, pipeline_id, stage_id, status, amount, temperatura, fonte, campanha, tipo_venda, categoria_venda, motivo_venda, reuniao_em, agendado_em, closed_at, lost_reason, created_at";

/**
 * Busca os negócios tolerando a migration ainda não aplicada. Se as colunas
 * novas não existirem, repete a consulta só com as antigas — assim a análise
 * roda sobre o histórico que já veio do RD, sem esperar o SQL.
 */
async function negociosParaAnalise(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  desde: Date,
): Promise<{ linhas: Array<Record<string, unknown>>; temColunasNovas: boolean }> {
  const buscar = async (cols: string) => {
    const out: Array<Record<string, unknown>> = [];
    for (let page = 0; page < 30; page++) {
      const { data, error } = await supabase
        .from("deals")
        .select(cols)
        .or(
          `status.eq.open,created_at.gte.${desde.toISOString()},closed_at.gte.${desde.toISOString()}`,
        )
        .order("created_at", { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as Array<Record<string, unknown>>;
      out.push(...rows);
      if (rows.length < PAGE) break;
    }
    return out;
  };

  try {
    return { linhas: await buscar(`${COLS_BASE}, ${COLS_NOVAS}`), temColunasNovas: true };
  } catch {
    return { linhas: await buscar(COLS_BASE), temColunasNovas: false };
  }
}

export const getComercialAnalise = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        meses: z.number().int().min(3).max(24).default(12),
        pipelineId: z.string().uuid().optional(),
        executivoId: z.string().uuid().optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { agrupar, cicloMedianoDias, funilComConversao, porMes, taxaVitoria } =
      await import("@/lib/comercial/analise");
    type NegocioAnalise = import("@/lib/comercial/analise").NegocioAnalise;

    const hoje = new Date();
    const desde = new Date(hoje.getFullYear(), hoje.getMonth() - (data.meses - 1), 1);

    const [{ data: isManager }, { data: pipelinesRaw }, { data: stagesRaw }, { data: profiles }] =
      await Promise.all([
        supabase.rpc("is_manager", { _user_id: userId }),
        supabase
          .from("pipelines")
          .select("id, nome, slug, ordem")
          .eq("tipo", "comercial")
          .order("ordem"),
        supabase
          .from("pipeline_stages")
          .select("id, pipeline_id, nome, ordem, kind")
          .order("ordem"),
        supabase.from("profiles").select("id, full_name, email"),
      ]);

    const { linhas, temColunasNovas } = await negociosParaAnalise(supabase, desde);

    // Quem não é gestão analisa a própria carteira.
    const foco = isManager ? (data.executivoId ?? null) : userId;

    let negocios: NegocioAnalise[] = linhas.map((r) => ({
      id: String(r.id),
      status: String(r.status ?? "open"),
      amount: r.amount == null ? null : Number(r.amount),
      created_at: String(r.created_at),
      closed_at: (r.closed_at as string | null) ?? null,
      // A regra da gestora: vale a ordem de compra; sem ela, o fechamento antigo.
      ganho_em:
        r.status === "won"
          ? ((r.ordem_compra_em as string | null) ?? (r.closed_at as string | null) ?? null)
          : null,
      executivo_user_id: (r.executivo_user_id as string | null) ?? null,
      stage_id: (r.stage_id as string | null) ?? null,
      fonte: (r.fonte as string | null) ?? null,
      campanha: (r.campanha as string | null) ?? null,
      tipo_venda: (r.tipo_venda as string | null) ?? null,
      motivo_venda: (r.motivo_venda as string | null) ?? null,
      lost_reason: (r.lost_reason as string | null) ?? null,
      reuniao_em: (r.reuniao_em as string | null) ?? null,
      agendado_em: (r.agendado_em as string | null) ?? null,
    }));

    const pipelineDe = new Map(
      (linhas ?? []).map((r) => [String(r.id), (r.pipeline_id as string | null) ?? null]),
    );
    if (data.pipelineId)
      negocios = negocios.filter((n) => pipelineDe.get(n.id) === data.pipelineId);
    if (foco) negocios = negocios.filter((n) => n.executivo_user_id === foco);

    // ---- funil com conversão ----
    const stages = (stagesRaw ?? []) as Array<{
      id: string;
      pipeline_id: string;
      nome: string;
      ordem: number;
      kind: string;
    }>;
    const abertos = negocios.filter((n) => n.status === "open");
    const contagem = new Map<string, { quantidade: number; valor: number }>();
    for (const n of abertos) {
      if (!n.stage_id) continue;
      const a = contagem.get(n.stage_id) ?? { quantidade: 0, valor: 0 };
      a.quantidade += 1;
      a.valor += Number(n.amount ?? 0);
      contagem.set(n.stage_id, a);
    }
    const etapasDoFunil = stages
      .filter((s) => s.kind === "open")
      .filter((s) => (data.pipelineId ? s.pipeline_id === data.pipelineId : true))
      .map((s) => ({ id: s.id, nome: s.nome, ordem: s.ordem }));

    // ---- ranking de executivos ----
    const nomeDe = new Map(
      (profiles ?? []).map((p: { id: string; full_name: string | null; email: string | null }) => [
        p.id,
        p.full_name || p.email || p.id,
      ]),
    );
    const porPessoa = new Map<string, { valor: number; quantidade: number; perdidos: number }>();
    for (const n of negocios) {
      const id = n.executivo_user_id;
      if (!id) continue;
      const a = porPessoa.get(id) ?? { valor: 0, quantidade: 0, perdidos: 0 };
      if (n.ganho_em) {
        a.valor += Number(n.amount ?? 0);
        a.quantidade += 1;
      } else if (n.status === "lost" && n.closed_at) a.perdidos += 1;
      porPessoa.set(id, a);
    }
    const ranking = [...porPessoa.entries()]
      .map(([id, v]) => ({
        id,
        nome: nomeDe.get(id) ?? id,
        ...v,
        taxa:
          v.quantidade + v.perdidos
            ? Math.round((v.quantidade / (v.quantidade + v.perdidos)) * 100)
            : null,
      }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 10);

    const ganhos = negocios.filter((n) => n.ganho_em);
    const valorGanho = ganhos.reduce((a, n) => a + Number(n.amount ?? 0), 0);

    return {
      isManager: !!isManager,
      temColunasNovas,
      pipelines: (pipelinesRaw ?? []) as Array<{ id: string; nome: string }>,
      executivos: [...porPessoa.keys()].map((id) => ({ id, nome: nomeDe.get(id) ?? id })),
      resumo: {
        valorGanho,
        quantidade: ganhos.length,
        ticketMedio: ganhos.length ? Math.round(valorGanho / ganhos.length) : 0,
        taxaVitoria: taxaVitoria(negocios),
        cicloDias: cicloMedianoDias(negocios),
        abertos: abertos.length,
        valorAberto: abertos.reduce((a, n) => a + Number(n.amount ?? 0), 0),
      },
      serieMensal: porMes(negocios, data.meses, hoje),
      funil: funilComConversao(etapasDoFunil, contagem),
      origens: agrupar(ganhos, (n) => n.fonte, { topo: 7 }),
      tiposVenda: agrupar(ganhos, (n) => n.tipo_venda, { topo: 6 }),
      motivosPerda: agrupar(
        negocios.filter((n) => n.status === "lost"),
        (n) => n.lost_reason ?? n.motivo_venda,
        { topo: 7, ordenarPor: "quantidade" },
      ),
      ranking,
    };
  });
