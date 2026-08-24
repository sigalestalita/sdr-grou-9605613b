import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Conversas com mensagens não lidas do lead (minhas + sem responsável).
 * Usado pelo aviso visual/sonoro do inbox.
 */
export const getInboxNotificationPulse = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("whatsapp_conversations")
      .select("id, lead_id, assigned_user_id, unread_count, last_preview, last_message_at, status, leads:lead_id(name, company_name)")
      .gt("unread_count", 0)
      .or(`assigned_user_id.eq.${userId},assigned_user_id.is.null`)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(50);
    if (error) throw new Error(error.message);
    const rows = (data ?? []).map((r) => {
      const lead = r.leads as { name?: string | null; company_name?: string | null } | null;
      return {
        id: r.id,
        leadId: r.lead_id,
        mine: r.assigned_user_id === userId,
        unread: r.unread_count ?? 0,
        preview: r.last_preview ?? null,
        lastMessageAt: r.last_message_at,
        leadName: lead?.name ?? "Lead",
        company: lead?.company_name ?? null,
      };
    });
    return {
      conversations: rows,
      totalUnread: rows.reduce((acc, r) => acc + r.unread, 0),
      mineUnread: rows.filter((r) => r.mine).reduce((acc, r) => acc + r.unread, 0),
    };
  });
