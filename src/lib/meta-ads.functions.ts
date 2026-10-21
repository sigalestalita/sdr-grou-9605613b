import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { montarRelatorio, type LinhaMeta, type CampanhaMeta } from "./meta-ads-relatorio";

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Campanhas da Meta no período, cruzadas com os leads e reuniões do kanban. */
export const getCampanhasMeta = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ de: dia, ate: dia }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isMgr } = await supabase.rpc("is_manager", { _user_id: userId });
    if (!isMgr) throw new Error("Apenas gestores veem o investimento em mídia.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const PAGE = 1000;
    const diario: LinhaMeta[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data: rows, error } = await supabaseAdmin
        .from("meta_ads_diario" as never)
        .select(
          "dia, ad_id, ad_name, adset_name, campaign_id, campaign_name, gasto, impressoes, cliques, leads",
        )
        .gte("dia", data.de)
        .lte("dia", data.ate)
        .order("dia")
        .order("ad_id")
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      diario.push(...((rows ?? []) as unknown as LinhaMeta[]));
      if (!rows || rows.length < PAGE) break;
    }

    const { data: camp, error: errCamp } = await supabaseAdmin
      .from("meta_ads_campanhas" as never)
      .select("campaign_id, nome, status, orcamento_diario, orcamento_total, alterada_em");
    if (errCamp) throw new Error(errCamp.message);

    const { data: estado } = await supabaseAdmin
      .from("meta_ads_diario" as never)
      .select("dia, atualizado_em")
      .order("atualizado_em", { ascending: false })
      .limit(1);
    const { data: primeiro } = await supabaseAdmin
      .from("meta_ads_diario" as never)
      .select("dia")
      .order("dia")
      .limit(1);
    const { data: ultimo } = await supabaseAdmin
      .from("meta_ads_diario" as never)
      .select("dia")
      .order("dia", { ascending: false })
      .limit(1);

    // Leads convertidos no período (pela data do formulário ou de criação),
    // com um dia de folga por causa do fuso; o corte exato é feito abaixo.
    const desloca = (d: string, dias: number) =>
      new Date(Date.parse(`${d}T00:00:00Z`) + dias * 864e5).toISOString();
    const ini = desloca(data.de, -1);
    const fim = desloca(data.ate, 2);
    const { data: stages } = await supabaseAdmin.from("stages").select("id, slug");
    const slug = new Map((stages ?? []).map((s) => [s.id as string, s.slug as string]));
    type LeadRow = {
      campaign: string | null;
      ad_name: string | null;
      stage_id: string | null;
      meeting_at: string | null;
      created_at: string;
      submitted_at: string | null;
    };
    const leads: LeadRow[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data: rows, error } = await supabaseAdmin
        .from("leads")
        .select(
          "id, campaign, ad_name, stage_id, meeting_at, created_at, submitted_at:form_payload->>submitted_at",
        )
        .or("campaign.not.is.null,ad_name.not.is.null")
        .or(
          `and(created_at.gte.${ini},created_at.lte.${fim}),and(form_payload->>submitted_at.gte.${ini},form_payload->>submitted_at.lte.${fim})`,
        )
        .order("id")
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      leads.push(...((rows ?? []) as unknown as LeadRow[]));
      if (!rows || rows.length < PAGE) break;
    }
    // Dia do lead no horário de Brasília.
    const diaBr = (iso: string) =>
      new Date(Date.parse(iso) - 3 * 3600e3).toISOString().slice(0, 10);
    const doPeriodo = leads
      .filter((l) => {
        const d = diaBr(l.submitted_at ?? l.created_at);
        return d >= data.de && d <= data.ate;
      })
      .map((l) => ({
        campaign: l.campaign,
        ad_name: l.ad_name,
        etapa: l.stage_id ? (slug.get(l.stage_id) ?? null) : null,
        meeting_at: l.meeting_at,
      }));

    const rel = montarRelatorio({
      diario,
      campanhas: (camp ?? []) as unknown as CampanhaMeta[],
      leads: doPeriodo,
    });
    const est = (estado ?? []) as unknown as Array<{ atualizado_em: string }>;
    const p = (primeiro ?? []) as unknown as Array<{ dia: string }>;
    const u = (ultimo ?? []) as unknown as Array<{ dia: string }>;
    return {
      ...rel,
      atualizadoEm: est[0]?.atualizado_em ?? null,
      dadosDe: p[0]?.dia ?? null,
      dadosAte: u[0]?.dia ?? null,
    };
  });
