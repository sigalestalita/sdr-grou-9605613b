import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Situação do webhook de leads do Meta, para a tela de Configurações. */
export const getStatusMetaLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isMgr } = await supabase.rpc("is_manager", { _user_id: userId });
    if (!isMgr) throw new Error("Apenas gestores veem a integração do Meta.");
    const { configMetaLeads } = await import("./meta-leads.server");
    const cfg = configMetaLeads();
    const faltando = [
      cfg.verifyToken ? null : "META_LEADS_VERIFY_TOKEN",
      cfg.pageToken ? null : "META_LEADS_PAGE_TOKEN",
      cfg.appSecret ? null : "META_APP_SECRET",
    ].filter((v): v is string => !!v);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: logs } = await supabaseAdmin
      .from("integration_logs")
      .select("created_at, status, detail")
      .eq("provider", "meta_leads")
      .order("created_at", { ascending: false })
      .limit(10);
    const base = (process.env.APP_PUBLIC_URL || "https://compass.grougp.com").replace(/\/$/, "");
    return {
      webhookUrl: `${base}/api/public/meta/leads`,
      faltando,
      ultimos: (logs ?? []).map((l) => ({
        em: l.created_at as string,
        status: l.status as string,
        detalhe: (l.detail ?? {}) as unknown as {
          resultado?: string;
          nome?: string;
          email?: string;
          erro?: string;
          sem_campo?: string[];
        },
      })),
    };
  });
