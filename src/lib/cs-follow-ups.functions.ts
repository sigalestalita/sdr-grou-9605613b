import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  CS_FOLLOWUP_CHANNELS,
  CS_FOLLOWUP_OUTCOMES,
  CS_FOLLOWUP_OUTCOME_LABEL,
} from "@/lib/cs-follow-up-types";

export type CsFollowUpKind =
  | "reuniao"
  | "alerta"
  | "jornada"
  | "sem_contato"
  | "timeline"
  | "tarefa";

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
  /** Tarefas (cs_tasks): tipo de canal; e-mail/WhatsApp só concluem por evidência. */
  taskType?: string | null;
  completedVia?: "evidencia" | "manual" | "gestor" | null;
  evidenceAt?: string | null;
};

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
    const dayMs = 86400000;
    const { DEFAULT_STAGE_SLA } = await import("@/lib/cs-types");
    const { getStageSla, fetchAllRows, getEvidenceConfig } =
      await import("@/lib/cs/cs-core.server");

    const from = new Date(data.from).toISOString();
    const to = new Date(data.to).toISOString();

    const nowIso = new Date().toISOString();

    const [
      clients,
      meetings,
      alerts,
      timelineFuture,
      profilesRes,
      slaCfg,
      tasks,
      evidenceCfg,
      mgr,
    ] = await Promise.all([
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
      fetchAllRows((f, t) =>
        supabase
          .from("cs_timeline_events")
          .select(
            "id, client_uid, title, description, event_type, channel, occurred_at, author_id, metadata",
          )
          .gt("occurred_at", nowIso)
          .lte("occurred_at", to)
          .range(f, t),
      ),
      supabase.from("profiles").select("id, full_name, email"),
      getStageSla(supabase),
      fetchAllRows((f, t) =>
        supabase
          .from("cs_tasks")
          .select(
            "id, client_uid, owner_id, title, task_type, due_at, status, done_at, completed_via, evidence_at, notes",
          )
          .neq("status", "cancelada")
          .lte("due_at", to)
          .range(f, t),
      ),
      getEvidenceConfig(supabase),
      supabase.rpc("is_manager", { _user_id: userId }),
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

    for (const t of tasks) {
      const c = clientByUid.get(t.client_uid);
      if (!c) continue;
      const done = t.status === "concluida";
      if (t.due_at < from && done) continue;
      items.push({
        key: `tarefa:${t.id}`,
        kind: "tarefa",
        refId: t.id,
        dueAt: t.due_at,
        done,
        doneAt: t.done_at ?? null,
        ...base(c, t.owner_id ?? c.cs_responsavel_id ?? null, "cs"),
        title: t.title,
        subtitle: t.notes?.trim() || null,
        taskType: t.task_type,
        completedVia: (t.completed_via as "evidencia" | "manual" | "gestor" | null) ?? null,
        evidenceAt: t.evidence_at ?? null,
      });
    }

    // Registros da timeline agendados para o futuro viram follow-ups.
    for (const ev of timelineFuture as Array<{
      id: string;
      client_uid: string;
      title: string;
      description: string | null;
      event_type: string;
      channel: string | null;
      occurred_at: string;
      author_id: string | null;
    }>) {
      const c = clientByUid.get(ev.client_uid);
      if (!c) continue;
      const owner = ev.author_id ?? c.cs_responsavel_id ?? null;
      items.push({
        key: `timeline:${ev.id}`,
        kind: "timeline",
        refId: ev.id,
        dueAt: ev.occurred_at,
        done: false,
        doneAt: null,
        ...base(c, owner, "cs"),
        title: ev.title,
        subtitle: ev.description?.trim() || `Registro agendado (${ev.channel ?? ev.event_type})`,
      });
    }

    // Checkpoints da jornada: fim do SLA da etapa e limite sem contato.
    for (const c of clients) {
      const stage = c.journey_stage as keyof typeof sla;
      const stageDays = typeof sla[stage] === "number" ? (sla[stage] as number) : 0;
      if (stageDays > 0 && c.stage_entered_at) {
        const due = new Date(
          new Date(c.stage_entered_at).getTime() + stageDays * dayMs,
        ).toISOString();
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

    return {
      period: { from, to },
      currentUserId: userId,
      isManager: Boolean(mgr.data),
      /** Canais cuja tarefa só conclui por evidência (cs_settings.evidence). */
      evidenceChannels: evidenceCfg.exigir_evidencia ? evidenceCfg.canais : [],
      owners,
      overdue,
      scheduled,
    };
  });

/** Marca um follow-up de CS como feito, registrando o resultado na timeline do cliente. */
export const completeCsFollowUp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        kind: z.enum(["reuniao", "alerta", "jornada", "sem_contato", "timeline", "tarefa"]),
        refId: z.string().uuid().nullable().optional(),
        clientUid: z.string().min(1),
        title: z.string().min(1),
        outcome: z.enum(CS_FOLLOWUP_OUTCOMES).optional(),
        channel: z.enum(CS_FOLLOWUP_CHANNELS).optional(),
        notes: z.string().max(2000).nullable().optional(),
        /** Se informado, agenda um novo follow-up após registrar o resultado. */
        nextAt: z.string().nullable().optional(),
        /** Gestão concluindo tarefa de canal sem evidência — exige justificativa em notes. */
        asManager: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const now = new Date().toISOString();
    const outcome = data.outcome ?? "atendimento_concluido";
    const nextAt = data.nextAt ? new Date(data.nextAt).toISOString() : null;
    const channel = data.channel ?? (data.kind === "reuniao" ? "reuniao" : "observacao");

    // Canal com evidência obrigatória: só conclui se o canal vinculado registrou
    // um envio recente para o cliente. Impede o "feito" sem o contato real.
    const { getEvidenceConfig } = await import("@/lib/cs/cs-core.server");
    const { requiresEvidence } = await import("@/lib/cs-types");
    const evidenceCfg = await getEvidenceConfig(supabase);
    let evidence: { id: string; occurred_at: string; title: string } | null = null;
    if (requiresEvidence(evidenceCfg, channel) && outcome !== "sem_resposta") {
      const since = new Date(Date.now() - evidenceCfg.retroativo_horas * 3600000).toISOString();
      const { data: ev } = await supabase
        .from("cs_timeline_events")
        .select("id, occurred_at, title")
        .eq("client_uid", data.clientUid)
        .eq("event_type", `${channel}_enviado`)
        .gte("occurred_at", since)
        .order("occurred_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      evidence = ev ?? null;
      let justified = false;
      if (data.asManager && (data.notes?.trim().length ?? 0) >= 5) {
        const { data: mgr } = await supabase.rpc("is_manager", { _user_id: userId });
        justified = Boolean(mgr) && evidenceCfg.gestor_pode_concluir;
      }
      if (!evidence && !justified) {
        const label = channel === "email" ? "e-mail" : "WhatsApp";
        throw new Error(
          `Nenhum ${label} enviado para este cliente nas últimas ${evidenceCfg.retroativo_horas}h pelo canal vinculado. Envie pelo ${label} do CS — a conclusão é automática.`,
        );
      }
    }

    if (data.kind === "tarefa" && data.refId) {
      const { error } = await supabase
        .from("cs_tasks")
        .update({
          status: "concluida",
          done_at: evidence?.occurred_at ?? now,
          done_by: userId,
          completed_via: evidence ? "evidencia" : data.asManager ? "gestor" : "manual",
          evidence_event_id: evidence?.id ?? null,
          evidence_at: evidence?.occurred_at ?? null,
          notes: data.notes?.trim() || null,
        })
        .eq("id", data.refId);
      if (error) throw new Error(error.message.replace(/^.*?(Tarefa de|Ação de)/, "$1"));
      if (nextAt) {
        const { data: prev } = await supabase
          .from("cs_tasks")
          .select("client_uid, contact_id, owner_id, title, task_type")
          .eq("id", data.refId)
          .maybeSingle();
        if (prev)
          await supabase.from("cs_tasks").insert({
            ...prev,
            due_at: nextAt,
            created_by: userId,
            source: "reagendamento",
            source_ref: data.refId,
          });
      }
    }

    if (data.kind === "reuniao" && data.refId) {
      const { error } = await supabase
        .from("cs_meetings")
        .update({ next_step_at: nextAt } as never)
        .eq("id", data.refId);
      if (error) throw new Error(error.message);
    }
    if (data.kind === "alerta" && data.refId) {
      const { error } = await supabase
        .from("cs_alerts")
        .update({
          status: "resolved",
          resolved_at: now,
          resolved_by: userId,
          follow_up_at: nextAt,
          observation: data.notes ?? null,
        } as never)
        .eq("id", data.refId);
      if (error) throw new Error(error.message);
    }

    if (data.kind === "timeline" && data.refId) {
      await supabase
        .from("cs_timeline_events")
        .update({ occurred_at: now } as never)
        .eq("id", data.refId);
    }

    // Reagendamento de checkpoints derivados vira um alerta com follow-up marcado.
    if (nextAt && (data.kind === "jornada" || data.kind === "sem_contato")) {
      await supabase.from("cs_alerts").insert({
        client_uid: data.clientUid,
        alert_type: data.kind === "jornada" ? "sla_estourado" : "sem_contato",
        reason: data.title,
        severity: "media",
        status: "open",
        follow_up_at: nextAt,
      } as never);
    }

    const outcomeLabel = CS_FOLLOWUP_OUTCOME_LABEL[outcome] ?? outcome;
    await supabase.from("cs_timeline_events").insert({
      client_uid: data.clientUid,
      author_id: userId,
      event_type: "follow_up_concluido",
      channel,
      title: `Follow-up: ${data.title} — ${outcomeLabel}`,
      description: data.notes?.trim() || null,
      occurred_at: now,
      metadata: {
        kind: data.kind,
        ref_id: data.refId ?? null,
        outcome,
        next_follow_up_at: nextAt,
        evidence_event_id: evidence?.id ?? null,
      },
    } as never);

    if (outcome !== "sem_resposta" && data.kind !== "alerta") {
      await supabase
        .from("cs_clients")
        .update({ last_contact_at: now } as never)
        .eq("client_uid", data.clientUid);
    }

    return { ok: true, nextAt };
  });

/** Reagenda um follow-up de CS sem marcá-lo como concluído. */
export const rescheduleCsFollowUp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        kind: z.enum(["reuniao", "alerta", "jornada", "sem_contato", "timeline", "tarefa"]),
        refId: z.string().uuid().nullable().optional(),
        clientUid: z.string().min(1),
        title: z.string().min(1),
        nextAt: z.string().min(1),
        notes: z.string().max(2000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const nextAt = new Date(data.nextAt).toISOString();

    if (data.kind === "reuniao" && data.refId) {
      const { error } = await supabase
        .from("cs_meetings")
        .update({ next_step_at: nextAt } as never)
        .eq("id", data.refId);
      if (error) throw new Error(error.message);
    } else if (data.kind === "alerta" && data.refId) {
      const { error } = await supabase
        .from("cs_alerts")
        .update({ follow_up_at: nextAt } as never)
        .eq("id", data.refId);
      if (error) throw new Error(error.message);
    } else if (data.kind === "timeline" && data.refId) {
      const { error } = await supabase
        .from("cs_timeline_events")
        .update({ occurred_at: nextAt } as never)
        .eq("id", data.refId);
      if (error) throw new Error(error.message);
    } else if (data.kind === "tarefa" && data.refId) {
      const { error } = await supabase
        .from("cs_tasks")
        .update({ due_at: nextAt })
        .eq("id", data.refId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("cs_alerts").insert({
        client_uid: data.clientUid,
        alert_type: data.kind === "jornada" ? "sla_estourado" : "sem_contato",
        reason: data.title,
        severity: "media",
        status: "open",
        follow_up_at: nextAt,
      } as never);
      if (error) throw new Error(error.message);
    }

    await supabase.from("cs_timeline_events").insert({
      client_uid: data.clientUid,
      author_id: userId,
      event_type: "follow_up_reagendado",
      channel: "observacao",
      title: `Follow-up reagendado: ${data.title}`,
      description: data.notes?.trim() || null,
      occurred_at: new Date().toISOString(),
      metadata: { kind: data.kind, ref_id: data.refId ?? null, next_follow_up_at: nextAt },
    } as never);

    return { ok: true, nextAt };
  });
