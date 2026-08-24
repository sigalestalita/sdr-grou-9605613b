import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CsFollowUpKind = "reuniao" | "alerta" | "jornada" | "sem_contato";

export type CsFollowUpItem = {
  key: string;
  kind: CsFollowUpKind;
  /** id da entidade de origem (reunião ou alerta) */
  refId: string | null;
  dueAt: string;
  done: boolean;
  doneAt: string | null;
  clientUid: string;
  clientName: string;
  stage: string;
  signal: string;
  healthScore: number;
  ownerId: string | null;
  ownerName: string;
  ownerRole: "cs" | "comercial";
  title: string;
  subtitle: string | null;
};

const dayMs = 86400000;

/**
 * Cronograma de follow-ups de CS por responsável (CS e executivo comercial).
 * Fontes: próximos passos de reuniões, alertas com follow-up marcado e os
 * checkpoints da jornada (onboarding / ativação / renovação) via SLA da etapa.
 */
export const getCsFollowUpAgenda = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        from: z.string(),
        to: z.string(),
        ownerId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { DEFAULT_STAGE_SLA } = await import("@/lib/cs-types");
    const { getStageSla, fetchAllRows } = await import("@/lib/cs/cs-core.server");

    const from = new Date(data.from).toISOString();
    const to = new Date(data.to).toISOString();

    const [clients, meetings, alerts, profilesRes, slaCfg] = await Promise.all([
      fetchAllRows((f, t) =>
        supabase
          .from("cs_clients")
          .select(
            "client_uid, nome_empresa, journey_stage, stage_entered_at, last_contact_at, current_signal, health_score, cs_responsavel_id, comercial_responsavel_id, ativo",
          )
          .eq("ativo", true)
          .range(f, t),
      ),
      fetchAllRows((f, t) =>
        supabase
          .from("cs_meetings")
          .select(
            "id, client_uid, title, next_step, next_step_at, occurred_at, status, owner_user_id",
          )
          .not("next_step_at", "is", null)
          .lte("next_step_at", to)
          .range(f, t),
      ),
      fetchAllRows((f, t) =>
        supabase
          .from("cs_alerts")
          .select("id, client_uid, reason, alert_type, severity, status, follow_up_at, resolved_at")
          .not("follow_up_at", "is", null)
          .lte("follow_up_at", to)
          .range(f, t),
      ),
      supabase.from("profiles").select("id, full_name, email"),
      getStageSla(supabase),
    ]);

    const sla = slaCfg ?? DEFAULT_STAGE_SLA;
    const profiles = profilesRes.data ?? [];
    const nameById = new Map(profiles.map((p) => [p.id, p.full_name || p.email || "—"]));
    const clientByUid = new Map(clients.map((c) => [c.client_uid, c]));

    const items: CsFollowUpItem[] = [];

    const base = (
      c: (typeof clients)[number],
      ownerId: string | null,
      ownerRole: "cs" | "comercial",
    ) => ({
      clientUid: c.client_uid,
      clientName: c.nome_empresa,
      stage: c.journey_stage,
      signal: c.current_signal ?? "sem_dado",
      healthScore: c.health_score ?? 0,
      ownerId,
      ownerName: ownerId ? (nameById.get(ownerId) ?? "—") : "Sem responsável",
      ownerRole,
    });

    for (const m of meetings) {
      const c = clientByUid.get(m.client_uid);
      if (!c) continue;
      const owner = m.owner_user_id ?? c.cs_responsavel_id ?? null;
      const dueAt = m.next_step_at as string;
      const done = m.status === "cancelada";
      if (dueAt < from && done) continue;
      items.push({
        key: `reuniao:${m.id}`,
        kind: "reuniao",
        refId: m.id,
        dueAt,
        done,
        doneAt: null,
        ...base(c, owner, "cs"),
        title: m.next_step || `Próximo passo — ${m.title}`,
        subtitle: `Reunião: ${m.title}`,
      });
    }

    for (const a of alerts) {
      const c = clientByUid.get(a.client_uid);
      if (!c) continue;
      const dueAt = a.follow_up_at as string;
      const done = a.status !== "open";
      if (dueAt < from && done) continue;
      items.push({
        key: `alerta:${a.id}`,
        kind: "alerta",
        refId: a.id,
        dueAt,
        done,
        doneAt: a.resolved_at ?? null,
        ...base(c, c.cs_responsavel_id ?? null, "cs"),
        title: `Tratativa de alerta (${a.severity})`,
        subtitle: a.reason,
      });
    }

    // Checkpoints da jornada: fim do SLA da etapa e limite sem contato.
    for (const c of clients) {
      const stage = c.journey_stage as keyof typeof sla;
      const stageDays = typeof sla[stage] === "number" ? (sla[stage] as number) : 0;
      if (stageDays > 0 && c.stage_entered_at) {
        const due = new Date(new Date(c.stage_entered_at).getTime() + stageDays * dayMs).toISOString();
        if (due <= to) {
          items.push({
            key: `jornada:${c.client_uid}`,
            kind: "jornada",
            refId: null,
            dueAt: due,
            done: false,
            doneAt: null,
            ...base(c, c.cs_responsavel_id ?? null, "cs"),
            title: `Checkpoint de jornada — ${c.journey_stage}`,
            subtitle: `SLA da etapa: ${stageDays} dias`,
          });
        }
      }
      const semContato = sla.sem_contato_dias ?? 45;
      const lastContact = c.last_contact_at ?? c.stage_entered_at;
      if (semContato > 0 && lastContact) {
        const due = new Date(new Date(lastContact).getTime() + semContato * dayMs).toISOString();
        if (due <= to) {
          items.push({
            key: `sem_contato:${c.client_uid}`,
            kind: "sem_contato",
            refId: null,
            dueAt: due,
            done: false,
            doneAt: null,
            ...base(c, c.cs_responsavel_id ?? null, "cs"),
            title: "Contato de relacionamento pendente",
            subtitle: c.last_contact_at
              ? `Último contato: ${new Date(c.last_contact_at).toLocaleDateString("pt-BR")}`
              : "Nenhum contato registrado",
          });
        }
      }
    }

    const filtered = data.ownerId ? items.filter((i) => i.ownerId === data.ownerId) : items;
    const overdue = filtered
      .filter((i) => !i.done && i.dueAt < from)
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    const scheduled = filtered
      .filter((i) => i.dueAt >= from)
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt));

    const owners = profiles
      .filter((p) =>
        clients.some((c) => c.cs_responsavel_id === p.id || c.comercial_responsavel_id === p.id),
      )
      .map((p) => ({ id: p.id, name: p.full_name || p.email || "—" }));

    return { period: { from, to }, currentUserId: userId, owners, overdue, scheduled };
  });

/** Marca um follow-up de CS como feito, registrando na timeline do cliente. */
export const completeCsFollowUp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        kind: z.enum(["reuniao", "alerta", "jornada", "sem_contato"]),
        refId: z.string().uuid().nullable().optional(),
        clientUid: z.string().min(1),
        title: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const now = new Date().toISOString();

    if (data.kind === "reuniao" && data.refId) {
      const { error } = await supabase
        .from("cs_meetings")
        .update({ next_step_at: null } as never)
        .eq("id", data.refId);
      if (error) throw new Error(error.message);
    }
    if (data.kind === "alerta" && data.refId) {
      const { error } = await supabase
        .from("cs_alerts")
        .update({ status: "resolved", resolved_at: now, resolved_by: userId } as never)
        .eq("id", data.refId);
      if (error) throw new Error(error.message);
    }

    await supabase.from("cs_timeline_events").insert({
      client_uid: data.clientUid,
      author_id: userId,
      event_type: "follow_up_concluido",
      channel: data.kind === "reuniao" ? "reuniao" : "observacao",
      title: `Follow-up concluído: ${data.title}`,
      description: null,
      occurred_at: now,
      metadata: { kind: data.kind, ref_id: data.refId ?? null },
    } as never);

    if (data.kind !== "alerta") {
      await supabase
        .from("cs_clients")
        .update({ last_contact_at: now } as never)
        .eq("client_uid", data.clientUid);
    }

    return { ok: true };
  });
