import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function exigirGestao(supabase: unknown, userId: string) {
  const { data } = await (
    supabase as {
      rpc: (f: string, a: Record<string, string>) => Promise<{ data: unknown }>;
    }
  ).rpc("is_manager", { _user_id: userId });
  if (!data) throw new Error("Só a gestão pode conectar o RD Marketing");
}

/** Situação da conexão com a API do RD Marketing e do histórico importado. */
export const statusRdMarketing = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigirGestao(context.supabase, context.userId);
    const { statusDaConexao } = await import("@/lib/rd/marketing-api.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [status, comUuid, buscados, daBase, conversoes, oportunidades] = await Promise.all([
      statusDaConexao(),
      supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .not("rd_marketing_id", "is", null),
      supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .not("rd_mkt_historico_em" as never, "is", null),
      supabaseAdmin
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("source", "rd_marketing"),
      supabaseAdmin
        .from("lead_conversoes")
        .select("id", { count: "exact", head: true })
        .eq("origem", "rd_marketing_api")
        .is("canal", null),
      supabaseAdmin
        .from("lead_conversoes")
        .select("id", { count: "exact", head: true })
        .eq("origem", "rd_marketing_api")
        .eq("canal", "oportunidade"),
    ]);
    return {
      ...status,
      leadsLigados: comUuid.count ?? 0,
      historicosBuscados: buscados.count ?? 0,
      /** Leads que entraram pelo export da base do RD Marketing. */
      leadsDaBase: daBase.count ?? 0,
      conversoesImportadas: conversoes.count ?? 0,
      oportunidadesImportadas: oportunidades.count ?? 0,
    };
  });

/** Endereço de autorização no RD Marketing (abre em seguida no navegador). */
export const conectarRdMarketing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await exigirGestao(context.supabase, context.userId);
    const { urlDeConexao } = await import("@/lib/rd/marketing-api.server");
    return { url: await urlDeConexao() };
  });
