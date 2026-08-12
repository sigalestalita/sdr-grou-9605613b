import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  DEFAULT_TOUCH_RULES,
  RESPONSIVE_OUTCOMES,
  TOUCH_ACTIONS,
  TOUCH_CHANNELS,
  TOUCH_OUTCOMES,
  type TouchRules,
} from "./touch-types";

/** Lista os touches de um lead (mais antigo primeiro) + perfis para exibir responsáveis. */
export const listLeadTouches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ leadId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [touchesRes, profilesRes, settingsRes] = await Promise.all([
      supabase
        .from("lead_touches")
        .select("*")
        .eq("lead_id", data.leadId)
        .order("occurred_at", { ascending: true }),
      supabase.from("profiles").select("id, full_name, email"),
      supabase.from("app_settings").select("value").eq("key", "touch_rules").maybeSingle(),
    ]);
    if (touchesRes.error) throw new Error(touchesRes.error.message);
    const rules = {
      ...DEFAULT_TOUCH_RULES,
      ...((settingsRes.data?.value as Partial<TouchRules> | null) ?? {}),
    } as TouchRules;
    return {
      touches: touchesRes.data ?? [],
      profiles: profilesRes.data ?? [],
      rules,
    };
  });

export const getTouchRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("app_settings")
      .select("value")
      .eq("key", "touch_rules")
      .maybeSingle();
    return { ...DEFAULT_TOUCH_RULES, ...((data?.value as Partial<TouchRules> | null) ?? {}) } as TouchRules;
  });

export const saveTouchRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        minTouchesBeforeDiscard: z.number().int().min(0).max(50),
        staleTouchDays: z.number().int().min(1).max(90),
        staleStageDays: z.number().int().min(1).max(180),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isManager } = await supabase.rpc("is_manager", { _user_id: userId });
    if (!isManager) throw new Error("Apenas a gestão pode alterar as regras de cadência");
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: "touch_rules", value: data as never, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return data;
  });

/** Cria ou atualiza um touch. Data/hora/responsável são preenchidos automaticamente. */
export const saveTouch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        leadId: z.string().uuid(),
        channel: z.enum(TOUCH_CHANNELS),
        actionType: z.enum(TOUCH_ACTIONS),
        outcome: z.enum(TOUCH_OUTCOMES),
        notes: z.string().max(2000).optional().or(z.literal("")),
        occurredAt: z.string().optional(),
        nextFollowUpAt: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const payload = {
      lead_id: data.leadId,
      channel: data.channel,
      action_type: data.actionType,
      outcome: data.outcome,
      notes: data.notes || null,
      occurred_at: data.occurredAt ?? new Date().toISOString(),
      next_follow_up_at: data.nextFollowUpAt || null,
    };
    if (data.id) {
      const { error } = await supabase.from("lead_touches").update(payload as never).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: inserted, error } = await supabase
      .from("lead_touches")
      .insert({ ...payload, author_id: userId } as never)
      .select("id, touch_number")
      .single();
    if (error) throw new Error(error.message);
    await supabase.from("lead_interactions").insert({
      lead_id: data.leadId,
      author_id: userId,
      type: "touch",
      content: `Touch ${inserted.touch_number} • ${data.channel} • ${data.outcome}`,
      metadata: { touch_id: inserted.id, channel: data.channel, outcome: data.outcome },
    });
    await supabase
      .from("leads")
      .update({ last_action_at: new Date().toISOString() } as never)
      .eq("id", data.leadId);
    return { id: inserted.id as string };
  });

export const deleteTouch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("lead_touches").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Marca (ou desmarca) um follow-up como concluído.
 * Passe `touchId` para um touch específico ou apenas `leadId` para concluir
 * todos os follow-ups pendentes do lead (o que a agenda mostra como item).
 */
export const setFollowUpDone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        leadId: z.string().uuid(),
        touchId: z.string().uuid().optional(),
        done: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const payload = {
      follow_up_done_at: data.done ? new Date().toISOString() : null,
      follow_up_done_by: data.done ? userId : null,
    };
    let q = supabase.from("lead_touches").update(payload as never).eq("lead_id", data.leadId);
    if (data.touchId) {
      q = q.eq("id", data.touchId);
    } else {
      q = q.not("next_follow_up_at", "is", null);
      q = data.done ? q.is("follow_up_done_at", null) : q.not("follow_up_done_at", "is", null);
    }
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Métricas gerenciais de cadência (por SDR e por operação). */
export const getTouchMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ from: z.string().optional(), to: z.string().optional() })
      .optional()
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const to = data?.to ? new Date(data.to) : new Date();
    const from = data?.from ? new Date(data.from) : new Date(Date.now() - 30 * 86400000);
    const fromISO = from.toISOString();
    const toISO = to.toISOString();

    const [rulesRes, stagesRes, profilesRes, leadsRes, touchesRes] = await Promise.all([
      supabase.from("app_settings").select("value").eq("key", "touch_rules").maybeSingle(),
      supabase.from("stages").select("id, name, slug, position, is_terminal").order("position"),
      supabase.from("profiles").select("id, full_name, email"),
      supabase
        .from("leads")
        .select(
          "id, assigned_to, stage_id, created_at, stage_entered_at, meeting_at, touch_count, last_touch_at, next_follow_up_at, last_touch_channel, last_touch_outcome, source",
        )
        .gte("created_at", fromISO)
        .lte("created_at", toISO)
        .or("source.is.null,source.neq.campaign_upload")
        .limit(20000),
      supabase
        .from("lead_touches")
        .select("id, lead_id, author_id, channel, action_type, outcome, occurred_at, touch_number")
        .gte("occurred_at", fromISO)
        .lte("occurred_at", toISO)
        .limit(50000),
    ]);
    if (leadsRes.error) throw new Error(leadsRes.error.message);
    if (touchesRes.error) throw new Error(touchesRes.error.message);

    const rules = { ...DEFAULT_TOUCH_RULES, ...((rulesRes.data?.value as Partial<TouchRules> | null) ?? {}) };
    const stages = stagesRes.data ?? [];
    const stageById = new Map(stages.map((s) => [s.id, s]));
    const profiles = profilesRes.data ?? [];
    const nameById = new Map(profiles.map((p) => [p.id, p.full_name || p.email || p.id]));
    const leads = leadsRes.data ?? [];
    const touches = touchesRes.data ?? [];

    const touchesByLead = new Map<string, typeof touches>();
    for (const t of touches) {
      const arr = touchesByLead.get(t.lead_id) ?? [];
      arr.push(t);
      touchesByLead.set(t.lead_id, arr);
    }
    for (const arr of touchesByLead.values()) {
      arr.sort((a, b) => (a.occurred_at as string).localeCompare(b.occurred_at as string));
    }

    const isDiscarded = (stageId: string | null) => {
      const s = stageId ? stageById.get(stageId) : null;
      return !!s?.is_terminal;
    };

    // ---- por SDR ----
    type SdrRow = {
      userId: string;
      name: string;
      leads: number;
      touches: number;
      avgTouchesPerLead: number;
      topChannel: string | null;
      avgHoursBetweenTouches: number | null;
      avgHoursToResponse: number | null;
      abandonedBelowMin: number;
      channelStats: { channel: string; touches: number; responses: number; responseRate: number }[];
      conversionByTouches: { bucket: string; leads: number; meetings: number; rate: number }[];
    };
    const sdrIds = Array.from(
      new Set([
        ...leads.map((l) => l.assigned_to).filter((v): v is string => !!v),
        ...touches.map((t) => t.author_id).filter((v): v is string => !!v),
      ]),
    );

    const bySdr: SdrRow[] = sdrIds.map((uid) => {
      const sdrLeads = leads.filter((l) => l.assigned_to === uid);
      const sdrTouches = touches.filter((t) => t.author_id === uid);

      const chMap = new Map<string, { touches: number; responses: number }>();
      for (const t of sdrTouches) {
        const c = chMap.get(t.channel) ?? { touches: 0, responses: 0 };
        c.touches += 1;
        if (RESPONSIVE_OUTCOMES.includes(t.outcome)) c.responses += 1;
        chMap.set(t.channel, c);
      }
      const channelStats = Array.from(chMap.entries())
        .map(([channel, v]) => ({
          channel,
          touches: v.touches,
          responses: v.responses,
          responseRate: v.touches ? v.responses / v.touches : 0,
        }))
        .sort((a, b) => b.touches - a.touches);

      const gaps: number[] = [];
      const responseHours: number[] = [];
      for (const l of sdrLeads) {
        const arr = touchesByLead.get(l.id) ?? [];
        for (let i = 1; i < arr.length; i++) {
          const gap =
            (new Date(arr[i].occurred_at as string).getTime() -
              new Date(arr[i - 1].occurred_at as string).getTime()) /
            3600000;
          if (gap >= 0) gaps.push(gap);
        }
        const first = arr[0];
        const responded = arr.find((t) => RESPONSIVE_OUTCOMES.includes(t.outcome));
        if (first && responded) {
          const h =
            (new Date(responded.occurred_at as string).getTime() -
              new Date(first.occurred_at as string).getTime()) /
            3600000;
          if (h >= 0) responseHours.push(h);
        }
      }
      const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

      const buckets = [
        { bucket: "0", test: (n: number) => n === 0 },
        { bucket: "1-2", test: (n: number) => n >= 1 && n <= 2 },
        { bucket: "3-5", test: (n: number) => n >= 3 && n <= 5 },
        { bucket: "6+", test: (n: number) => n >= 6 },
      ];
      const conversionByTouches = buckets.map((b) => {
        const inBucket = sdrLeads.filter((l) => b.test(l.touch_count ?? 0));
        const meetings = inBucket.filter((l) => !!l.meeting_at).length;
        return {
          bucket: b.bucket,
          leads: inBucket.length,
          meetings,
          rate: inBucket.length ? meetings / inBucket.length : 0,
        };
      });

      return {
        userId: uid,
        name: nameById.get(uid) ?? uid,
        leads: sdrLeads.length,
        touches: sdrTouches.length,
        avgTouchesPerLead: sdrLeads.length
          ? Math.round((sdrLeads.reduce((s, l) => s + (l.touch_count ?? 0), 0) / sdrLeads.length) * 10) / 10
          : 0,
        topChannel: channelStats[0]?.channel ?? null,
        avgHoursBetweenTouches: avg(gaps) != null ? Math.round(avg(gaps)! * 10) / 10 : null,
        avgHoursToResponse: avg(responseHours) != null ? Math.round(avg(responseHours)! * 10) / 10 : null,
        abandonedBelowMin: sdrLeads.filter(
          (l) => isDiscarded(l.stage_id) && (l.touch_count ?? 0) < rules.minTouchesBeforeDiscard,
        ).length,
        channelStats,
        conversionByTouches,
      };
    });
    bySdr.sort((a, b) => b.leads - a.leads);

    // ---- operação ----
    const meetingLeads = leads.filter((l) => !!l.meeting_at);
    const discardedLeads = leads.filter((l) => isDiscarded(l.stage_id));
    const nowMs = Date.now();
    const staleTouchMs = rules.staleTouchDays * 86400000;
    const staleStageMs = rules.staleStageDays * 86400000;

    const avgOf = (arr: number[]) =>
      arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : 0;

    const opChannel = new Map<string, { touches: number; responses: number }>();
    for (const t of touches) {
      const c = opChannel.get(t.channel) ?? { touches: 0, responses: 0 };
      c.touches += 1;
      if (RESPONSIVE_OUTCOMES.includes(t.outcome)) c.responses += 1;
      opChannel.set(t.channel, c);
    }

    const responseByTouchNumber = new Map<number, { touches: number; responses: number }>();
    for (const t of touches) {
      const n = Math.min(t.touch_number ?? 1, 10);
      const c = responseByTouchNumber.get(n) ?? { touches: 0, responses: 0 };
      c.touches += 1;
      if (RESPONSIVE_OUTCOMES.includes(t.outcome)) c.responses += 1;
      responseByTouchNumber.set(n, c);
    }

    const operation = {
      leads: leads.length,
      totalTouches: touches.length,
      avgTouchesUntilMeeting: avgOf(meetingLeads.map((l) => l.touch_count ?? 0)),
      avgTouchesUntilDiscard: avgOf(discardedLeads.map((l) => l.touch_count ?? 0)),
      pendingFollowUps: leads.filter(
        (l) => l.next_follow_up_at && new Date(l.next_follow_up_at).getTime() <= nowMs,
      ).length,
      scheduledFollowUps: leads.filter(
        (l) => l.next_follow_up_at && new Date(l.next_follow_up_at).getTime() > nowMs,
      ).length,
      leadsWithoutTouch: leads.filter((l) => (l.touch_count ?? 0) === 0 && !isDiscarded(l.stage_id)).length,
      forgottenLeads: leads.filter(
        (l) =>
          !isDiscarded(l.stage_id) &&
          (l.touch_count ?? 0) > 0 &&
          l.last_touch_at != null &&
          nowMs - new Date(l.last_touch_at).getTime() > staleTouchMs,
      ).length,
      stuckInStage: leads.filter(
        (l) =>
          !isDiscarded(l.stage_id) &&
          l.stage_entered_at != null &&
          nowMs - new Date(l.stage_entered_at).getTime() > staleStageMs,
      ).length,
      abandonedBelowMin: discardedLeads.filter((l) => (l.touch_count ?? 0) < rules.minTouchesBeforeDiscard)
        .length,
      channelStats: Array.from(opChannel.entries())
        .map(([channel, v]) => ({
          channel,
          touches: v.touches,
          responses: v.responses,
          responseRate: v.touches ? v.responses / v.touches : 0,
        }))
        .sort((a, b) => b.touches - a.touches),
      responseByTouchNumber: Array.from(responseByTouchNumber.entries())
        .map(([touchNumber, v]) => ({
          touchNumber,
          touches: v.touches,
          responses: v.responses,
          responseRate: v.touches ? v.responses / v.touches : 0,
        }))
        .sort((a, b) => a.touchNumber - b.touchNumber),
    };

    return { period: { from: fromISO, to: toISO }, rules, bySdr, operation };
  });
