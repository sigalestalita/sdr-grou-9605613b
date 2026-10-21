import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  montarRelatorio,
  type CampanhaMeta,
  type EnvioCompass,
  type LinhaMeta,
} from "./meta-ads-relatorio";

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

    // Envios de formulário da Meta no período (pela data do envio), com um dia
    // de folga por causa do fuso; o corte exato é feito abaixo pelo dia BRT.
    const desloca = (d: string, dias: number) =>
      new Date(Date.parse(`${d}T00:00:00Z`) + dias * 864e5).toISOString();
    const ini = desloca(data.de, -1);
    const fim = desloca(data.ate, 2);
    const diaBr = (iso: string) =>
      new Date(Date.parse(iso) - 3 * 3600e3).toISOString().slice(0, 10);
    const noPeriodo = (iso: string | null | undefined) => {
      if (!iso || Number.isNaN(Date.parse(iso))) return false;
      const d = diaBr(iso);
      return d >= data.de && d <= data.ate;
    };
    const { data: stages } = await supabaseAdmin.from("stages").select("id, slug");
    const slug = new Map((stages ?? []).map((s) => [s.id as string, s.slug as string]));
    type Payload = {
      lead_id?: string;
      submitted_at?: string;
      meta_ids?: { campaign_id?: string; ad_id?: string };
      reconversoes?: Array<{ lead_id?: string; em?: string; campanha?: string }>;
    } | null;
    type LeadRow = {
      id: string;
      campaign: string | null;
      ad_name: string | null;
      stage_id: string | null;
      meeting_at: string | null;
      created_at: string;
      form_payload: Payload;
    };
    const colunas = "id, campaign, ad_name, stage_id, meeting_at, created_at, form_payload";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lerTudo = async (filtro: (q: any) => any) => {
      const out: LeadRow[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data: rows, error } = await filtro(
          supabaseAdmin.from("leads").select(colunas).order("id"),
        ).range(from, from + PAGE - 1);
        if (error) throw new Error(error.message);
        out.push(...((rows ?? []) as LeadRow[]));
        if (!rows || rows.length < PAGE) break;
      }
      return out;
    };
    // Cards com envio da Meta (o que criou o card ou reconversões anexadas).
    const comEnvio = await lerTudo((q) =>
      q.or("form_payload->>lead_id.not.is.null,form_payload->reconversoes.not.is.null"),
    );
    const envios = new Map<string, EnvioCompass>();
    const cardsComEnvio = new Set<string>();
    const etapaDe = (l: LeadRow) => (l.stage_id ? (slug.get(l.stage_id) ?? null) : null);
    // Card criado até 1h antes do envio conta como novo (o RD costuma criar
    // o card minutos antes de a planilha trazer o mesmo envio).
    const novo = (l: LeadRow, em: string) => Date.parse(l.created_at) >= Date.parse(em) - 3600e3;
    for (const l of comEnvio) {
      const fp = l.form_payload;
      if (fp?.lead_id) cardsComEnvio.add(l.id);
      const em = fp?.submitted_at ?? l.created_at;
      if (fp?.lead_id && noPeriodo(em))
        envios.set(fp.lead_id, {
          card: l.id,
          campaign_id: fp.meta_ids?.campaign_id ?? null,
          campanha: l.campaign,
          ad_id: fp.meta_ids?.ad_id ?? null,
          ad_name: l.ad_name,
          novo: novo(l, em),
          etapa: etapaDe(l),
          meeting_at: l.meeting_at,
        });
      for (const r of fp?.reconversoes ?? []) {
        if (r.lead_id) cardsComEnvio.add(l.id);
        if (!r.lead_id || envios.has(r.lead_id) || !noPeriodo(r.em)) continue;
        envios.set(r.lead_id, {
          card: l.id,
          campaign_id: null,
          campanha: r.campanha ?? null,
          ad_id: null,
          ad_name: null,
          novo: novo(l, r.em!),
          etapa: etapaDe(l),
          meeting_at: l.meeting_at,
        });
      }
    }
    // Cards sem id de lead da Meta (antigos ou só do RD), pela campanha/anúncio.
    const semEnvio = await lerTudo((q) =>
      q
        .or("campaign.not.is.null,ad_name.not.is.null")
        .gte("created_at", ini)
        .lte("created_at", fim),
    );
    for (const l of semEnvio) {
      if (cardsComEnvio.has(l.id) || !noPeriodo(l.created_at)) continue;
      envios.set(`card:${l.id}`, {
        card: l.id,
        campaign_id: null,
        campanha: l.campaign,
        ad_id: null,
        ad_name: l.ad_name,
        novo: true,
        etapa: etapaDe(l),
        meeting_at: l.meeting_at,
      });
    }

    const rel = montarRelatorio({
      diario,
      campanhas: (camp ?? []) as unknown as CampanhaMeta[],
      envios: [...envios.values()],
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
