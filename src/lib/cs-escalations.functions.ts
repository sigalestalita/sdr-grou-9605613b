import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CsEscalation = {
  kind: "tarefa" | "cadencia" | "reuniao" | "alerta";
  refId: string;
  clientUid: string;
  clientName: string;
  ownerId: string | null;
  ownerName: string;
  title: string;
  dueAt: string;
  daysLate: number;
  acted: boolean;
  reason: "atraso" | "sem_acao" | "atraso_sem_acao";
  firstSeenAt: string;
  notifiedAt: string | null;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  note: string | null;
};

export const ESCALATION_KIND_LABEL: Record<CsEscalation["kind"], string> = {
  tarefa: "Tarefa",
  cadencia: "Cadência",
  reuniao: "Próximo passo",
  alerta: "Alerta",
};
export const ESCALATION_REASON_LABEL: Record<CsEscalation["reason"], string> = {
  atraso: "Atrasada",
  sem_acao: "Sem ação com a empresa",
  atraso_sem_acao: "Atrasada e sem ação",
};

/** Escalações ativas (só gestão). Recalcula antes de listar. */
export const listCsEscalations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        ownerId: z.string().uuid().nullable().optional(),
        includeAcknowledged: z.boolean().default(false),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isManager } = await supabase.rpc("is_manager", { _user_id: userId });
    if (!isManager) return { isManager: false, items: [] as CsEscalation[], active: 0 };
    const { data: active, error: refreshErr } = await supabase.rpc("cs_refresh_escalations");
    if (refreshErr) throw new Error(refreshErr.message);
    let q = supabase
      .from("cs_escalation_notices")
      .select("*, cs_clients(nome_empresa)")
      .is("resolved_at", null)
      .order("days_late", { ascending: false });
    if (data.ownerId) q = q.eq("owner_id", data.ownerId);
    if (!data.includeAcknowledged) q = q.is("acknowledged_at", null);
    const [{ data: rows, error }, { data: profiles }] = await Promise.all([
      q,
      supabase.from("profiles").select("id, full_name, email"),
    ]);
    if (error) throw new Error(error.message);
    const nameOf = new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.email || "—"]));
    const items: CsEscalation[] = (rows ?? []).map((r) => ({
      kind: r.kind as CsEscalation["kind"],
      refId: r.ref_id,
      clientUid: r.client_uid,
      clientName: (r.cs_clients as { nome_empresa: string } | null)?.nome_empresa ?? r.client_uid,
      ownerId: r.owner_id,
      ownerName: r.owner_id ? (nameOf.get(r.owner_id) ?? "—") : "Sem responsável",
      title: r.title,
      dueAt: r.due_at,
      daysLate: r.days_late,
      acted: r.acted,
      reason: r.reason as CsEscalation["reason"],
      firstSeenAt: r.first_seen_at,
      notifiedAt: r.notified_at,
      acknowledgedAt: r.acknowledged_at,
      acknowledgedBy: r.acknowledged_by,
      note: r.note,
    }));
    return { isManager: true, items, active: Number(active ?? 0) };
  });

/** Gestor dá ciência (some da lista até voltar a escalar) ou reabre. */
export const acknowledgeCsEscalation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        kind: z.enum(["tarefa", "cadencia", "reuniao", "alerta"]),
        refId: z.string().min(1),
        note: z.string().max(1000).nullable().optional(),
        undo: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("cs_escalation_notices")
      .update(
        data.undo
          ? { acknowledged_at: null, acknowledged_by: null }
          : {
              acknowledged_at: new Date().toISOString(),
              acknowledged_by: userId,
              note: data.note ?? null,
            },
      )
      .eq("kind", data.kind)
      .eq("ref_id", data.refId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Reatribui a ação escalada para outra pessoa (tarefa e cadência). */
export const reassignCsEscalation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        kind: z.enum(["tarefa", "cadencia"]),
        refId: z.string().uuid(),
        ownerId: z.string().uuid().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isManager } = await supabase.rpc("is_manager", { _user_id: userId });
    if (!isManager) throw new Error("Apenas a gestão reatribui ações");
    const { error } =
      data.kind === "tarefa"
        ? await supabase.from("cs_tasks").update({ owner_id: data.ownerId }).eq("id", data.refId)
        : await supabase
            .from("cs_cadence_tasks")
            .update({ owner_id: data.ownerId })
            .eq("id", data.refId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Dispara o e-mail de escalações agora (gestão). */
export const sendCsEscalationEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isManager } = await supabase.rpc("is_manager", { _user_id: userId });
    if (!isManager) throw new Error("Apenas a gestão");
    const { notifyEscalationsByEmail } = await import("@/lib/cs/escalations.server");
    return notifyEscalationsByEmail({ force: true });
  });

/** Lista "vermelho 6+ meses" (gestão): prévia e envio para diretoria/admin. */
export const getCsRedList = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isManager } = await supabase.rpc("is_manager", { _user_id: userId });
    if (!isManager) throw new Error("Apenas a gestão");
    const { computeRedList } = await import("@/lib/cs/red-list.server");
    return { rows: await computeRedList() };
  });

export const sendCsRedListEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isManager } = await supabase.rpc("is_manager", { _user_id: userId });
    if (!isManager) throw new Error("Apenas a gestão");
    const { sendRedListEmail } = await import("@/lib/cs/red-list.server");
    return sendRedListEmail({ force: true });
  });
