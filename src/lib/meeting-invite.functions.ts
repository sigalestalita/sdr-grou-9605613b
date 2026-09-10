import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Agenda do executivo num dia: ocupados, conflito com o horário escolhido e horários livres. */
export const getExecutivoAvailability = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        executivoId: z.string().uuid(),
        day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        durationMin: z.number().int().min(15).max(240).optional(),
        leadId: z.string().uuid().optional(),
        meetingAt: z.string().datetime().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { executivoAvailability } = await import("@/lib/sdr/meeting-invite.server");
    return executivoAvailability({
      executivoId: data.executivoId,
      day: data.day,
      durationMin: data.durationMin,
      excludeLeadId: data.leadId ?? null,
      meetingAt: data.meetingAt ? new Date(data.meetingAt) : null,
    });
  });

/** Prévia da passada de bastão (BANT, observações, resumo da conversa) para o SDR revisar. */
export const previewMeetingHandoff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ leadId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { buildHandoff, getMeetingSettings } = await import("@/lib/sdr/meeting-invite.server");
    const [{ data: lead, error }, settings] = await Promise.all([
      supabaseAdmin.from("leads").select("*").eq("id", data.leadId).maybeSingle(),
      getMeetingSettings(),
    ]);
    if (error) throw new Error(error.message);
    if (!lead) throw new Error("Lead não encontrado");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handoff = await buildHandoff(lead as any);
    const l = lead as {
      meeting_handoff?: string | null;
      meeting_duration_min?: number | null;
      email?: string | null;
    };
    const executivoId = (lead as { executivo_id?: string | null }).executivo_id ?? null;
    let executivo: {
      name: string;
      email: string | null;
      meetingUrl: string | null;
      gcal: boolean;
    } | null = null;
    if (executivoId) {
      const [{ data: p }, { data: integ }] = await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("full_name, email")
          .eq("id", executivoId)
          .maybeSingle(),
        supabaseAdmin
          .from("cs_user_integrations")
          .select("meeting_url, gcal_ics_url, email_address")
          .eq("user_id", executivoId)
          .maybeSingle(),
      ]);
      const i = integ as {
        meeting_url?: string | null;
        gcal_ics_url?: string | null;
        email_address?: string | null;
      } | null;
      executivo = {
        name: p?.full_name || p?.email || "Executivo",
        email: i?.email_address || p?.email || null,
        meetingUrl: i?.meeting_url ?? null,
        gcal: !!i?.gcal_ics_url,
      };
    }
    return {
      handoff,
      current: l.meeting_handoff ?? null,
      durationMin: l.meeting_duration_min ?? settings.duration_min,
      leadEmail: l.email ?? null,
      executivo,
    };
  });

/** O SDR dispara o convite (lead + executivo) e o briefing do executivo. */
export const sendMeetingInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        leadId: z.string().uuid(),
        handoff: z.string().max(6000).optional(),
        durationMin: z.number().int().min(15).max(240).optional(),
        leadEmail: z.string().email().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { sendMeetingInvite: send } = await import("@/lib/sdr/meeting-invite.server");
    return send({
      leadId: data.leadId,
      sdrId: context.userId,
      handoff: data.handoff ?? null,
      durationMin: data.durationMin ?? null,
      leadEmail: data.leadEmail ?? null,
    });
  });

export const cancelMeetingInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ leadId: z.string().uuid(), reason: z.string().max(300).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { cancelMeetingInvite: cancel } = await import("@/lib/sdr/meeting-invite.server");
    return cancel({ leadId: data.leadId, sdrId: context.userId, reason: data.reason });
  });

/** Link fixo de reunião (Meet/Zoom pessoal) que entra nos convites. */
export const saveMeetingUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ url: z.string().url().max(300).nullable(), userId: z.string().uuid().optional() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertCsAccess } = await import("@/lib/cs/integrations.server");
    const access = await assertCsAccess(context.userId);
    const target = data.userId && data.userId !== context.userId ? data.userId : context.userId;
    if (target !== context.userId && !access.isManager)
      throw new Error("Apenas gestores podem alterar o link de outra pessoa");
    const { error } = await supabaseAdmin
      .from("cs_user_integrations")
      .upsert(
        { user_id: target, meeting_url: data.url, updated_at: new Date().toISOString() } as never,
        {
          onConflict: "user_id",
        },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
