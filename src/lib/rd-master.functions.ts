import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Espelha empresas, contatos e negócios do RD CRM e projeta em CS e Kanban. */
export const syncRdAll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { dryRun?: boolean } | undefined) =>
    z.object({ dryRun: z.boolean().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { assertCsAccess } = await import("@/lib/cs/integrations.server");
    const access = await assertCsAccess(context.userId);
    if (!access.isManager) throw new Error("Apenas a gestão pode sincronizar o RD CRM");
    const { syncRdEverything } = await import("@/lib/rd/rd-sync.server");
    try {
      const r = await syncRdEverything({ dryRun: data.dryRun });
      return { ok: true as const, ...r };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
  });

/** Últimas execuções da sincronização completa do RD. */
export const getRdAllSyncLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("integration_logs")
      .select("*")
      .eq("provider", "rd_station")
      .eq("action", "sync_rd_all")
      .order("created_at", { ascending: false })
      .limit(10);
    return { logs: data ?? [] };
  });
