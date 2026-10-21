/*
 * Recebe do Make o desempenho das campanhas da Meta e grava no Compass.
 *
 * O Make manda os resultados como a Meta devolve (Insights por anúncio e a
 * lista de campanhas); a tradução para as colunas daqui fica nesta função,
 * para o cenário do Make ser só "buscar e enviar".
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type InsightMeta = {
  date_start?: string;
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  spend?: string | number;
  impressions?: string | number;
  clicks?: string | number;
  actions?: Array<{ action_type?: string; value?: string | number }> | null;
  leads?: string | number;
};

type CampanhaMeta = {
  id?: string;
  name?: string;
  objective?: string;
  effective_status?: string;
  daily_budget?: string | number;
  lifetime_budget?: string | number;
  created_time?: string;
  updated_time?: string;
};

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Leads de formulário: a Meta conta em `actions` com o tipo "lead". */
export function leadsDasAcoes(i: InsightMeta): number {
  if (i.leads != null && i.leads !== "") return num(i.leads);
  const a = (i.actions ?? []).find((x) => x?.action_type === "lead");
  return a ? num(a.value) : 0;
}

export function linhaDiaria(i: InsightMeta) {
  const dia = String(i.date_start ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || !i.ad_id) return null;
  return {
    dia,
    ad_id: String(i.ad_id),
    ad_name: i.ad_name ?? null,
    adset_id: i.adset_id ?? null,
    adset_name: i.adset_name ?? null,
    campaign_id: i.campaign_id ?? null,
    campaign_name: i.campaign_name ?? null,
    gasto: Math.round(num(i.spend) * 100) / 100,
    impressoes: Math.round(num(i.impressions)),
    cliques: Math.round(num(i.clicks)),
    leads: Math.round(leadsDasAcoes(i)),
    atualizado_em: new Date().toISOString(),
  };
}

/** Orçamento vem em centavos da moeda da conta. */
const reais = (v: unknown) => (v == null || v === "" ? null : num(v) / 100);

export function linhaCampanha(c: CampanhaMeta) {
  if (!c.id || !c.name) return null;
  return {
    campaign_id: String(c.id),
    nome: c.name,
    objetivo: c.objective ?? null,
    status: c.effective_status ?? null,
    orcamento_diario: reais(c.daily_budget),
    orcamento_total: reais(c.lifetime_budget),
    criada_em: c.created_time ?? null,
    alterada_em: c.updated_time ?? null,
    atualizado_em: new Date().toISOString(),
  };
}

export async function gravarDesempenhoMeta(corpo: {
  diario?: InsightMeta[];
  campanhas?: CampanhaMeta[];
}) {
  const diario = (corpo.diario ?? []).map(linhaDiaria).filter((x) => x !== null);
  const campanhas = (corpo.campanhas ?? []).map(linhaCampanha).filter((x) => x !== null);
  const LOTE = 500;
  for (let i = 0; i < diario.length; i += LOTE) {
    const { error } = await supabaseAdmin
      .from("meta_ads_diario" as never)
      .upsert(diario.slice(i, i + LOTE) as never, { onConflict: "dia,ad_id" });
    if (error) throw new Error(`meta_ads_diario: ${error.message}`);
  }
  if (campanhas.length) {
    const { error } = await supabaseAdmin
      .from("meta_ads_campanhas" as never)
      .upsert(campanhas as never, { onConflict: "campaign_id" });
    if (error) throw new Error(`meta_ads_campanhas: ${error.message}`);
  }
  return { dias: diario.length, campanhas: campanhas.length };
}
