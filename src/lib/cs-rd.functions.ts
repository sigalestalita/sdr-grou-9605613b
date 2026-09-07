import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Importa/atualiza os clientes do RD CRM (Cliente, Cliente Inativo, Cliente de Partner) no CS. */
export const syncRdCsClients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { dryRun?: boolean } | undefined) =>
    z.object({ dryRun: z.boolean().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { assertCsAccess } = await import("@/lib/cs/integrations.server");
    const access = await assertCsAccess(context.userId);
    if (!access.isManager) throw new Error("Apenas a gestão pode sincronizar clientes do RD CRM");
    const { syncRdClientsToCs } = await import("@/lib/cs/rd-clients.server");
    try {
      const r = await syncRdClientsToCs({ dryRun: data.dryRun });
      return { ok: true as const, ...r };
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : String(e),
        fetched: 0,
        matched: 0,
        created: 0,
        updated: 0,
        errors: [] as string[],
      };
    }
  });

/** Últimas execuções da sincronização de clientes do RD. */
export const getRdCsSyncLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("integration_logs")
      .select("*")
      .eq("provider", "rd_station")
      .eq("action", "sync_cs_clients")
      .order("created_at", { ascending: false })
      .limit(10);
    return { logs: data ?? [] };
  });
