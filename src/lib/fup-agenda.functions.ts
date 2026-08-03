import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Agenda/cronograma de follow-ups: manuais (touches) + automáticos (sequências de FUP). */
export const getFupAgenda = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ from: z.string(), to: z.string(), assignedTo: z.string().uuid().nullable().optional() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const from = new Date(data.from).toISOString();
    const to = new Date(data.to).toISOString();

    const [profilesRes, stagesRes, leadsRes, enrollRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email"),
      supabase.from("stages").select("id, name, slug, color, is_terminal"),
      supabase
        .from("leads")
        .select(
          "id, name, company_name, phone, email, lead_type, priority, stage_id, assigned_to, touch_count, last_touch_at, last_touch_channel, last_touch_outcome, next_follow_up_at",
        )
        .not("next_follow_up_at", "is", null)
        .lte("next_follow_up_at", to)
        .limit(5000),
      supabase
        .from("whatsapp_fup_enrollments")
        .select(
          "id, sequence_id, lead_id, status, current_step, next_run_at, whatsapp_fup_sequences:sequence_id(name), leads:lead_id(id, name, company_name, phone, assigned_to, stage_id, priority, lead_type, touch_count, last_touch_at, last_touch_channel)",
        )
        .eq("status", "active")
        .not("next_run_at", "is", null)
        .lte("next_run_at", to)
        .limit(5000),
    ]);
    if (leadsRes.error) throw new Error(leadsRes.error.message);

    const stages = stagesRes.data ?? [];
    const stageById = new Map(stages.map((s) => [s.id, s]));
    const profiles = profilesRes.data ?? [];
    const nameById = new Map(profiles.map((p) => [p.id, p.full_name || p.email || "—"]));

    type Item = {
      key: string;
      kind: "manual" | "auto";
      dueAt: string;
      leadId: string;
      leadName: string;
      company: string | null;
      phone: string | null;
      priority: string | null;
      leadType: string | null;
      stageName: string | null;
      assignedTo: string | null;
      assignedName: string;
      touchCount: number;
      lastTouchAt: string | null;
      lastTouchChannel: string | null;
      title: string;
      subtitle: string | null;
    };

    const items: Item[] = [];

    for (const l of leadsRes.data ?? []) {
      const stage = l.stage_id ? stageById.get(l.stage_id) : null;
      if (stage?.is_terminal) continue;
      items.push({
        key: `manual:${l.id}`,
        kind: "manual",
        dueAt: l.next_follow_up_at as string,
        leadId: l.id,
        leadName: l.name,
        company: l.company_name,
        phone: l.phone,
        priority: l.priority,
        leadType: l.lead_type,
        stageName: stage?.name ?? null,
        assignedTo: l.assigned_to,
        assignedName: l.assigned_to ? (nameById.get(l.assigned_to) ?? "—") : "Fila geral",
        touchCount: l.touch_count ?? 0,
        lastTouchAt: l.last_touch_at,
        lastTouchChannel: l.last_touch_channel,
        title: `Touch ${(l.touch_count ?? 0) + 1} — follow-up manual`,
        subtitle: l.last_touch_channel ? `Último contato: ${l.last_touch_channel}` : null,
      });
    }

    type Enr = {
      id: string;
      current_step: number;
      next_run_at: string;
      whatsapp_fup_sequences: { name: string } | null;
      leads: {
        id: string;
        name: string;
        company_name: string | null;
        phone: string | null;
        assigned_to: string | null;
        stage_id: string | null;
        priority: string | null;
        lead_type: string | null;
        touch_count: number | null;
        last_touch_at: string | null;
        last_touch_channel: string | null;
      } | null;
    };
    for (const e of (enrollRes.data ?? []) as unknown as Enr[]) {
      const l = e.leads;
      if (!l) continue;
      const stage = l.stage_id ? stageById.get(l.stage_id) : null;
      items.push({
        key: `auto:${e.id}`,
        kind: "auto",
        dueAt: e.next_run_at,
        leadId: l.id,
        leadName: l.name,
        company: l.company_name,
        phone: l.phone,
        priority: l.priority,
        leadType: l.lead_type,
        stageName: stage?.name ?? null,
        assignedTo: l.assigned_to,
        assignedName: l.assigned_to ? (nameById.get(l.assigned_to) ?? "—") : "Fila geral",
        touchCount: l.touch_count ?? 0,
        lastTouchAt: l.last_touch_at,
        lastTouchChannel: l.last_touch_channel,
        title: `FUP automático — passo ${(e.current_step ?? 0) + 1}`,
        subtitle: e.whatsapp_fup_sequences?.name ?? null,
      });
    }

    const filtered = data.assignedTo ? items.filter((i) => i.assignedTo === data.assignedTo) : items;
    const overdue = filtered
      .filter((i) => i.dueAt < from)
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    const scheduled = filtered
      .filter((i) => i.dueAt >= from)
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt));

    return {
      period: { from, to },
      currentUserId: userId,
      profiles,
      overdue,
      scheduled,
    };
  });
