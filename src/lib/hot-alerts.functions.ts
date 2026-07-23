import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type HotAlertRow = {
  id: string;
  created_at: string;
  status: string;
  // JSON payload from integration_logs.detail; typed as any so it stays serializable
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  detail: any;
};

export const listHotLeadAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { limit?: number; status?: string | null } | undefined) => data ?? {})
  .handler(async ({ data, context }) => {
    const limit = Math.min(Math.max(data.limit ?? 100, 1), 500);
    let q = context.supabase
      .from("integration_logs")
      .select("id, created_at, status, detail")
      .eq("action", "hot_lead_alert")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as HotAlertRow[];
  });