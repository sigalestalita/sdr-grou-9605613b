import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getRdTokenInfo } from "@/lib/rd-token.server";
import { idsDosFunis, rdGet, type Json, type RdDealRaw } from "./rd-api.server";
import { dealRow } from "./rd-mirror.server";

/*
 * Espelho contínuo dos funis do SDR.
 *
 * O relatório do RD é processado uma vez por dia, de madrugada: o que foi
 * criado ou fechado hoje só aparece amanhã. O painel do Compass lê daqui, e
 * aqui é atualizado a cada 15 minutos junto com a sincronização do RD.
 *
 * Relê os negócios criados nos últimos 120 dias de cada funil do SDR — não só
 * os novos —, porque etapa, dono e venda/perda mudam depois da criação, e o
 * filtro de data da API do RD é pela criação.
 */

const DIAS = 120;
const TETO_DE_PAGINAS = 15;

/**
 * `funil`: posição do funil na lista configurada (0, 1…) para espelhar um só
 * por chamada — cada funil cabe no limite de processamento do servidor.
 */
export async function espelharFunisSdr(opts?: {
  funil?: number;
  dias?: number;
}): Promise<{ funis: number; negocios: number }> {
  const { token } = await getRdTokenInfo();
  if (!token) throw new Error("RD Station não conectado.");

  const { data: cfg } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", "rd_pipeline")
    .maybeSingle();
  const nomes = String(
    (cfg?.value as { name?: string } | null)?.name ??
      "Leads - Empresa [SDR]; Leads - Alianças Estratégicas [SDR]",
  )
    .split(";")
    .map((n) => n.trim())
    .filter(Boolean)
    .filter((_, i) => opts?.funil === undefined || i === opts.funil);

  const ate = new Date();
  const de = new Date(ate.getTime() - (opts?.dias ?? DIAS) * 24 * 3600 * 1000);
  let negocios = 0;
  const ids = await idsDosFunis(nomes, token);
  for (const nome of nomes) {
    const funilId = ids.get(nome);
    if (!funilId) throw new Error(`Funil "${nome}" não encontrado no RD`);
    const linhas: Json[] = [];
    for (let page = 1; page <= TETO_DE_PAGINAS; page++) {
      const json = await rdGet(
        "/deals",
        {
          deal_pipeline_id: funilId,
          created_at_period: "true",
          start_date: de.toISOString(),
          end_date: ate.toISOString(),
          page: String(page),
          limit: "200",
        },
        token,
      );
      const lote = (json.deals ?? []) as RdDealRaw[];
      // A listagem não traz o nome do funil; aqui ele é sabido pela consulta.
      for (const d of lote) linhas.push({ ...dealRow(d), pipeline: nome } as never);
      if (!json.has_more || lote.length === 0) break;
    }
    for (let i = 0; i < linhas.length; i += 300) {
      const { error } = await supabaseAdmin
        .from("rd_deals")
        .upsert(linhas.slice(i, i + 300) as never, { onConflict: "rd_id" });
      if (error) throw new Error(`rd_deals: ${error.message}`);
    }
    negocios += linhas.length;
  }
  return { funis: nomes.length, negocios };
}
