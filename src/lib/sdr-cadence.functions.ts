import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  ALL_STEPS_BY_ID,
  BANT_STATUS,
  type LeadBant,
  type SdrTrack,
} from "./sdr-playbook";
import { TOUCH_OUTCOMES } from "./touch-types";
import {
  buildCadencePlan,
  evaluateSla,
  resolveTrack,
  stepIdFromTouchMetadata,
  suggestTrack,
  type CadencePlan,
} from "./sdr-cadence";

const LEAD_FIELDS =
  "id, name, company_name, phone, email, assigned_to, stage_id, created_at, converted_at, first_approach_at, company_size, linkedin_company_size, lead_type, cadence_track, cadence_started_at, cadence_status, bant, touch_count, last_touch_at, meeting_at";

function doneMapFromTouches(touches: { metadata: unknown; occurred_at: string }[]) {
  const map: Record<string, string> = {};
  for (const t of touches) {
    const id = stepIdFromTouchMetadata(t.metadata);
    if (id && !map[id]) map[id] = t.occurred_at;
  }
  return map;
}

/** Jornada de cadência completa de um lead (trilha, passos, SLA e BANT). */
export const getLeadCadence = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ leadId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [leadRes, touchesRes] = await Promise.all([
      supabase.from("leads").select(LEAD_FIELDS).eq("id", data.leadId).maybeSingle(),
      supabase
        .from("lead_touches")
        .select("id, occurred_at, channel, action_type, outcome, metadata")
        .eq("lead_id", data.leadId)
        .order("occurred_at", { ascending: true }),
    ]);
    if (leadRes.error) throw new Error(leadRes.error.message);
    if (!leadRes.data) throw new Error("Lead não encontrado");
    const lead = leadRes.data;
    const touches = touchesRes.data ?? [];

    const track = resolveTrack(lead);
    const startAt = lead.cadence_started_at ?? lead.converted_at ?? lead.created_at;
    const plan = buildCadencePlan({ track, startAt, doneMap: doneMapFromTouches(touches) });
    const sla = evaluateSla({
      createdAt: lead.created_at,
      convertedAt: lead.converted_at,
      firstTouchAt: touches[0]?.occurred_at ?? lead.first_approach_at,
    });

    return {
      lead: {
        id: lead.id,
        name: lead.name,
        company: lead.company_name,
        cadenceStatus: lead.cadence_status,
        cadenceTrackOverride: lead.cadence_track as SdrTrack | null,
        suggestedTrack: suggestTrack(lead),
        touchCount: lead.touch_count ?? 0,
        meetingAt: lead.meeting_at,
      },
      plan,
      sla,
      bant: (lead.bant ?? {}) as LeadBant,
    };
  });

/** Ajusta trilha / status (ativa, pausada, encerrada) e início da cadência. */
export const setLeadCadence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        leadId: z.string().uuid(),
        track: z.enum(["pme", "mid", "enterprise"]).nullable().optional(),
        status: z.enum(["ativa", "pausada", "encerrada"]).optional(),
        restart: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: Record<string, unknown> = {};
    if (data.track !== undefined) patch["cadence_track"] = data.track;
    if (data.status) patch["cadence_status"] = data.status;
    if (data.restart) patch["cadence_started_at"] = new Date().toISOString();
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await supabase.from("leads").update(patch as never).eq("id", data.leadId);
    if (error) throw new Error(error.message);
    await supabase.from("lead_interactions").insert({
      lead_id: data.leadId,
      author_id: userId,
      type: "cadence",
      content:
        data.status === "encerrada"
          ? "Cadência encerrada (break-up)"
          : data.status === "pausada"
            ? "Cadência pausada"
            : data.restart
              ? "Cadência reiniciada"
              : "Cadência atualizada",
      metadata: patch as never,
    });
    return { ok: true };
  });

/** Marca um passo do playbook como executado, criando o touch correspondente. */
export const completeCadenceStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        leadId: z.string().uuid(),
        stepId: z.string().min(1),
        outcome: z.enum(TOUCH_OUTCOMES).default("sem_resposta"),
        notes: z.string().max(2000).optional().or(z.literal("")),
        nextFollowUpAt: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const step = ALL_STEPS_BY_ID[data.stepId];
    if (!step) throw new Error("Passo de cadência inválido");

    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("id, cadence_started_at, converted_at, created_at, first_approach_at")
      .eq("id", data.leadId)
      .maybeSingle();
    if (leadErr) throw new Error(leadErr.message);
    if (!lead) throw new Error("Lead não encontrado");

    const nowISO = new Date().toISOString();
    const { data: inserted, error } = await supabase
      .from("lead_touches")
      .insert({
        lead_id: data.leadId,
        author_id: userId,
        channel: step.channel,
        action_type: step.actionType,
        outcome: data.outcome,
        notes: data.notes || step.title,
        occurred_at: nowISO,
        next_follow_up_at: data.nextFollowUpAt || null,
        metadata: { cadence_step: step.id, cadence_day: step.day, playbook: "sdr_2026" } as never,
      } as never)
      .select("id, touch_number")
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("lead_interactions").insert({
      lead_id: data.leadId,
      author_id: userId,
      type: "touch",
      content: `Playbook • Dia ${step.day} • ${step.title} (${data.outcome})`,
      metadata: { touch_id: inserted.id, cadence_step: step.id } as never,
    });

    const patch: Record<string, unknown> = { last_action_at: nowISO };
    if (!lead.cadence_started_at) {
      patch["cadence_started_at"] = lead.converted_at ?? lead.created_at ?? nowISO;
    }
    if (!lead.first_approach_at) patch["first_approach_at"] = nowISO;
    if (step.breakup) patch["cadence_status"] = "encerrada";
    await supabase.from("leads").update(patch as never).eq("id", data.leadId);

    return { touchId: inserted.id as string, breakup: !!step.breakup };
  });

const bantEntry = z
  .object({ status: z.enum(BANT_STATUS).optional(), notes: z.string().max(2000).optional() })
  .optional();

/** Salva a qualificação BANT do lead (registro obrigatório antes da passagem de bastão). */
export const saveLeadBant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        leadId: z.string().uuid(),
        bant: z.object({
          budget: bantEntry,
          authority: bantEntry,
          need: bantEntry,
          timeline: bantEntry,
          summary: z.string().max(4000).optional(),
        }),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const value: LeadBant = { ...data.bant, updatedAt: new Date().toISOString() };
    const { error } = await supabase
      .from("leads")
      .update({ bant: value as never } as never)
      .eq("id", data.leadId);
    if (error) throw new Error(error.message);
    await supabase.from("lead_interactions").insert({
      lead_id: data.leadId,
      author_id: userId,
      type: "bant",
      content: data.bant.summary?.trim() || "Qualificação BANT atualizada",
      metadata: value as never,
    });
    return { ok: true };
  });

export type CadenceBoardItem = {
  key: string;
  leadId: string;
  leadName: string;
  company: string | null;
  assignedTo: string | null;
  assignedName: string;
  track: SdrTrack;
  stepId: string;
  title: string;
  script: string;
  channel: string;
  channelTag: string;
  day: number;
  dueAt: string;
  late: boolean;
  breakup: boolean;
  touchCount: number;
};

/**
 * Quadro semanal da cadência do playbook: o que cada SDR precisa executar,
 * por dia, mais os passos atrasados e os SLAs de primeiro atendimento.
 */
export const getSdrCadenceBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ from: z.string(), to: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const from = new Date(data.from);
    const to = new Date(data.to);

    const [stagesRes, profilesRes, leadsRes] = await Promise.all([
      supabase.from("stages").select("id, name, slug, is_terminal"),
      supabase.from("profiles").select("id, full_name, email"),
      supabase
        .from("leads")
        .select(LEAD_FIELDS)
        .neq("cadence_status", "encerrada")
        .gte("created_at", new Date(Date.now() - 75 * 86400000).toISOString())
        .or("source.is.null,source.neq.campaign_upload")
        .limit(4000),
    ]);
    if (leadsRes.error) throw new Error(leadsRes.error.message);

    const stages = stagesRes.data ?? [];
    const terminal = new Set(stages.filter((s) => s.is_terminal).map((s) => s.id));
    const nameById = new Map(
      (profilesRes.data ?? []).map((p) => [p.id, p.full_name || p.email || p.id] as const),
    );
    const leads = (leadsRes.data ?? []).filter(
      (l) => !l.stage_id || !terminal.has(l.stage_id),
    );
    const leadIds = leads.map((l) => l.id);

    const touches: { lead_id: string; occurred_at: string; metadata: unknown }[] = [];
    for (let i = 0; i < leadIds.length; i += 500) {
      const chunk = leadIds.slice(i, i + 500);
      const res = await supabase
        .from("lead_touches")
        .select("lead_id, occurred_at, metadata")
        .in("lead_id", chunk)
        .order("occurred_at", { ascending: true })
        .limit(20000);
      if (res.data) touches.push(...res.data);
    }
    const byLead = new Map<string, typeof touches>();
    for (const t of touches) {
      const arr = byLead.get(t.lead_id) ?? [];
      arr.push(t);
      byLead.set(t.lead_id, arr);
    }

    const scheduled: CadenceBoardItem[] = [];
    const overdue: CadenceBoardItem[] = [];
    let slaBreached = 0;
    let slaPending = 0;
    let noTouch = 0;
    const trackCount: Record<SdrTrack, number> = { pme: 0, mid: 0, enterprise: 0 };
    const plansByLead: { leadId: string; plan: CadencePlan }[] = [];

    for (const lead of leads) {
      const leadTouches = byLead.get(lead.id) ?? [];
      const track = resolveTrack(lead);
      trackCount[track] += 1;
      const plan = buildCadencePlan({
        track,
        startAt: lead.cadence_started_at ?? lead.converted_at ?? lead.created_at,
        doneMap: doneMapFromTouches(leadTouches),
      });
      plansByLead.push({ leadId: lead.id, plan });

      const sla = evaluateSla({
        createdAt: lead.created_at,
        convertedAt: lead.converted_at,
        firstTouchAt: leadTouches[0]?.occurred_at ?? lead.first_approach_at,
      });
      if (sla.status === "estourado") slaBreached += 1;
      if (sla.status === "pendente") slaPending += 1;
      if (leadTouches.length === 0) noTouch += 1;

      if (lead.cadence_status === "pausada") continue;

      const base = {
        leadId: lead.id,
        leadName: lead.name,
        company: lead.company_name,
        assignedTo: lead.assigned_to,
        assignedName: lead.assigned_to ? (nameById.get(lead.assigned_to) ?? "—") : "Sem responsável",
        track,
        touchCount: lead.touch_count ?? 0,
      };

      for (const s of plan.steps) {
        if (s.done) continue;
        const due = new Date(s.dueAt).getTime();
        const item: CadenceBoardItem = {
          ...base,
          key: `${lead.id}:${s.id}`,
          stepId: s.id,
          title: s.title,
          script: s.script,
          channel: s.channel,
          channelTag: s.channelTag,
          day: s.day,
          dueAt: s.dueAt,
          late: s.status === "atrasado",
          breakup: !!s.breakup,
        };
        if (s.status === "atrasado") {
          overdue.push(item);
        } else if (due >= from.getTime() && due < to.getTime()) {
          scheduled.push(item);
        }
      }
    }

    overdue.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    scheduled.sort((a, b) => a.dueAt.localeCompare(b.dueAt));

    return {
      currentUserId: userId,
      profiles: profilesRes.data ?? [],
      scheduled,
      overdue: overdue.slice(0, 400),
      summary: {
        leads: leads.length,
        slaBreached,
        slaPending,
        noTouch,
        trackCount,
        finished: plansByLead.filter((p) => p.plan.finished).length,
        lateLeads: plansByLead.filter((p) => p.plan.lateCount > 0).length,
      },
    };
  });
