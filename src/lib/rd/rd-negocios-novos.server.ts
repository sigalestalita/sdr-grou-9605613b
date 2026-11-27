import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getRdTokenInfo } from "@/lib/rd-token.server";
import {
  fetchMapaDeFunis,
  rdGet,
  rdId,
  type RdDealRaw,
  type RdOrganizationRaw,
} from "./rd-api.server";
import { dealRow, orgRow } from "./rd-mirror.server";
import { destinoDoFunilRd } from "./funis";

/*
 * Negócios comerciais novos do RD → Compass.
 *
 * A migração de 08/11 trouxe os funis comerciais ([C] Vendas, parceiros,
 * cross/up sell, indicação) uma vez só; a sincronização de 15 em 15 minutos
 * cuida apenas dos funis do SDR. Esta rotina fecha a lacuna: lê no RD os
 * negócios CRIADOS nos últimos dias nesses funis (a API do RD não filtra por
 * alteração) e cria no Compass os que ainda não existem — com empresa,
 * contatos do card e produtos. O que já existe no Compass não é tocado:
 * etapa, valor, dono e status mudados aqui continuam valendo.
 */
export type ResultadoNegociosNovos = {
  desde: string;
  funis: string[];
  noRd: number;
  jaNoCompass: number;
  novos: number;
  criados: number;
  empresasCriadas: number;
  contatosCriados: number;
  erros: string[];
};

const chunk = <T>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

export async function trazerNegociosNovosDoRd(opts?: {
  /** Data inicial (ISO). Padrão: 3 dias atrás. */
  desde?: string;
  dryRun?: boolean;
}): Promise<ResultadoNegociosNovos> {
  const { token } = await getRdTokenInfo();
  if (!token) throw new Error("RD Station não conectado.");
  const desde = opts?.desde ?? new Date(Date.now() - 3 * 86400_000).toISOString();
  const ate = new Date().toISOString();
  const erros: string[] = [];

  // Funis do RD cujo destino é "negócio".
  const mapa = await fetchMapaDeFunis(token);
  const funis = new Map<string, string>(); // id → nome
  for (const [id, nome] of mapaDosFunis(mapa))
    if (destinoDoFunilRd(nome).tipo === "negocio") funis.set(id, nome);

  const doRd: RdDealRaw[] = [];
  for (const [funilId] of funis) {
    for (let page = 1; page <= 50; page++) {
      const json = await rdGet(
        "/deals",
        {
          deal_pipeline_id: funilId,
          created_at_period: "true",
          start_date: desde,
          end_date: ate,
          page: String(page),
          limit: "200",
        },
        token,
      );
      const lote = (json.deals ?? []) as RdDealRaw[];
      doRd.push(...lote);
      if (!json.has_more || lote.length === 0) break;
    }
  }
  const linhas = doRd.filter((d) => rdId(d)).map((d) => dealRow(d, mapa));
  const ids = [...new Set(linhas.map((l) => l.rd_id))];

  // Quais já estão no Compass.
  const existentes = new Set<string>();
  for (const part of chunk(ids, 150)) {
    const { data, error } = await supabaseAdmin
      .from("deals")
      .select("rd_deal_id")
      .in("rd_deal_id", part);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as Array<{ rd_deal_id: string }>) existentes.add(r.rd_deal_id);
  }
  const novos = linhas.filter((l) => !existentes.has(l.rd_id));

  const resultado: ResultadoNegociosNovos = {
    desde,
    funis: [...funis.values()],
    noRd: ids.length,
    jaNoCompass: existentes.size,
    novos: novos.length,
    criados: 0,
    empresasCriadas: 0,
    contatosCriados: 0,
    erros,
  };
  if (novos.length === 0) return resultado;

  // Organizações dos negócios novos que o Compass ainda não conhece.
  const orgIds = [...new Set(novos.map((n) => n.rd_org_id).filter((x): x is string => !!x))];
  const conhecidas = new Set<string>();
  for (const part of chunk(orgIds, 150)) {
    const { data } = await supabaseAdmin
      .from("companies")
      .select("rd_org_id")
      .in("rd_org_id", part);
    for (const r of (data ?? []) as Array<{ rd_org_id: string }>) conhecidas.add(r.rd_org_id);
    const { data: mescladas } = await supabaseAdmin
      .from("empresas_mescladas")
      .select("sai_rd_org_id")
      .in("sai_rd_org_id", part);
    for (const r of (mescladas ?? []) as Array<{ sai_rd_org_id: string }>)
      conhecidas.add(r.sai_rd_org_id);
  }
  const orgsNovas = orgIds.filter((id) => !conhecidas.has(id));

  if (!opts?.dryRun) {
    // Espelho (staging) só do que vai entrar.
    for (const part of chunk(novos, 300)) {
      const { error } = await supabaseAdmin
        .from("rd_deals")
        .upsert(part as never, { onConflict: "rd_id" });
      if (error) erros.push(`espelho de negócios: ${error.message}`);
    }
    const orgRows = [];
    for (const id of orgsNovas) {
      try {
        const o = (await rdGet(`/organizations/${id}`, {}, token)) as RdOrganizationRaw;
        if (rdId(o)) orgRows.push(orgRow(o));
      } catch (e) {
        erros.push(`organização ${id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    for (const part of chunk(orgRows, 300)) {
      const { error } = await supabaseAdmin
        .from("rd_organizations")
        .upsert(part as never, { onConflict: "rd_id" });
      if (error) erros.push(`espelho de empresas: ${error.message}`);
    }
  }

  const { transformRdToObjects } = await import("./rd-transform.server");
  const t = await transformRdToObjects({
    dryRun: opts?.dryRun,
    only: ["companies", "deals"],
    filtro: { orgs: orgsNovas, deals: novos.map((n) => n.rd_id) },
    soCriar: true,
  });
  resultado.criados = t.deals.created;
  resultado.empresasCriadas = t.companies.created;
  resultado.contatosCriados = t.contacts.created;
  erros.push(...t.errors);

  if (!opts?.dryRun) {
    await supabaseAdmin.from("integration_logs").insert({
      provider: "rd_station",
      action: "negocios_novos",
      status: erros.length ? "partial" : "ok",
      detail: { ...resultado, erros: erros.slice(0, 20) } as never,
    });
  }
  return resultado;
}

/** Pares (id, nome) dos funis do mapa do RD. */
function mapaDosFunis(mapa: Awaited<ReturnType<typeof fetchMapaDeFunis>>): Array<[string, string]> {
  return [...mapa.porFunil.entries()];
}
