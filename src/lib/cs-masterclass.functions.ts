import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import {
  computeMilestones,
  suggestMasterclasses,
  type MasterclassConfig,
  type Participation,
} from "@/lib/cs/masterclass";

export type CsMasterclassParticipation = {
  id: string;
  clientUid: string;
  moduleId: number;
  heldAt: string;
  contactId: string | null;
  participantes: string | null;
  analistaId: string | null;
  usedInProject: boolean;
  usedAt: string | null;
  usedNote: string | null;
  notes: string | null;
};

type DB = SupabaseClient<Database>;

const toRow = (r: Record<string, unknown>): CsMasterclassParticipation => ({
  id: String(r.id),
  clientUid: String(r.client_uid),
  moduleId: Number(r.module_id),
  heldAt: String(r.held_at),
  contactId: (r.contact_id as string) ?? null,
  participantes: (r.participantes as string) ?? null,
  analistaId: (r.analista_id as string) ?? null,
  usedInProject: Boolean(r.used_in_project),
  usedAt: (r.used_at as string) ?? null,
  usedNote: (r.used_note as string) ?? null,
  notes: (r.notes as string) ?? null,
});

/**
 * Recalcula os marcos (1º/2º Sucesso) do cliente. Quando um marco é
 * atingido pela primeira vez, registra nas observações (cs_records, tipo
 * "marco") e na timeline, e grava a data no cliente. Depois refaz o health.
 */
export async function refreshMasterclassMilestones(
  db: DB,
  clientUid: string,
  userId: string | null,
  cfg: MasterclassConfig,
) {
  const [{ data: rows }, { data: client }] = await Promise.all([
    db
      .from("cs_masterclass_participations")
      .select("module_id, held_at, used_in_project, used_at")
      .eq("client_uid", clientUid),
    db
      .from("cs_clients")
      .select("primeiro_sucesso_at, segundo_sucesso_at")
      .eq("client_uid", clientUid)
      .maybeSingle(),
  ]);
  const m = computeMilestones((rows ?? []) as Participation[], cfg);
  const patch: Database["public"]["Tables"]["cs_clients"]["Update"] = {};
  const announce = async (
    label: string,
    when: string,
    rule: { modulos: number[]; participacoes: number; usos: number },
  ) => {
    const text = `${label} atingido em ${new Date(when).toLocaleDateString("pt-BR")} — ${rule.participacoes} masterclass(es) dos módulos ${rule.modulos.join("/")} e ${rule.usos} uso em projeto real.`;
    await db.from("cs_records").insert({
      client_uid: clientUid,
      author_id: userId,
      tipo: "marco",
      content: text,
    });
    await db.from("cs_timeline_events").insert({
      client_uid: clientUid,
      author_id: userId,
      event_type: "marco_sucesso",
      channel: "masterclass",
      title: `${label} — Masterclasses`,
      description: text,
      occurred_at: new Date(when).toISOString(),
      metadata: { marco: label, automatico: false },
    });
  };
  if (m.primeiro && !client?.primeiro_sucesso_at) {
    patch.primeiro_sucesso_at = m.primeiro;
    await announce("1º Sucesso", m.primeiro, cfg.sucesso.primeiro);
  }
  if (!m.primeiro && client?.primeiro_sucesso_at) patch.primeiro_sucesso_at = null;
  if (m.segundo && !client?.segundo_sucesso_at) {
    patch.segundo_sucesso_at = m.segundo;
    await announce("2º Sucesso", m.segundo, cfg.sucesso.segundo);
  }
  if (!m.segundo && client?.segundo_sucesso_at) patch.segundo_sucesso_at = null;
  if (Object.keys(patch).length)
    await db.from("cs_clients").update(patch).eq("client_uid", clientUid);
  const { recomputeHealth } = await import("@/lib/cs/cs-core.server");
  await recomputeHealth(db, clientUid);
  return m;
}

/** Participações, sugestões pela regra de cor/tempo e marcos de um cliente. */
export const getCsMasterclass = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ clientUid: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { getMasterclassConfig } = await import("@/lib/cs/cs-core.server");
    const { lastNWeeks } = await import("@/lib/cs-types");
    const weeks = lastNWeeks(12);
    const [cfg, { data: rows }, { data: client }, { data: snaps }] = await Promise.all([
      getMasterclassConfig(supabase),
      supabase
        .from("cs_masterclass_participations")
        .select("*")
        .eq("client_uid", data.clientUid)
        .order("held_at", { ascending: false }),
      supabase
        .from("cs_clients")
        .select(
          "tag_uso, diagnostico_causa, data_inicio_contrato, current_signal, primeiro_sucesso_at, segundo_sucesso_at",
        )
        .eq("client_uid", data.clientUid)
        .maybeSingle(),
      supabase
        .from("cs_signal_snapshots")
        .select("week_start, signal")
        .eq("client_uid", data.clientUid)
        .gte("week_start", weeks[0])
        .order("week_start"),
    ]);
    const history = weeks.map(
      (w) => (snaps ?? []).find((s) => s.week_start === w)?.signal ?? "sem_dado",
    );
    if (!(snaps ?? []).length && client?.current_signal)
      history[history.length - 1] = client.current_signal;
    const parts = (rows ?? []) as Record<string, unknown>[];
    const suggestions = suggestMasterclasses(
      {
        history,
        tagUso: client?.tag_uso,
        diagCause: client?.diagnostico_causa,
        contractStart: client?.data_inicio_contrato,
      },
      parts as unknown as Participation[],
      cfg,
    );
    return {
      modules: cfg.modulos,
      participations: parts.map(toRow),
      suggestions,
      milestones: {
        primeiro: client?.primeiro_sucesso_at ?? null,
        segundo: client?.segundo_sucesso_at ?? null,
      },
      computed: computeMilestones(parts as unknown as Participation[], cfg),
      diagCause: client?.diagnostico_causa ?? null,
    };
  });

export const saveCsMasterclassParticipation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        clientUid: z.string().min(1),
        moduleId: z.number().int().min(1).max(20),
        heldAt: z.string().min(8),
        contactId: z.string().uuid().nullable().optional(),
        participantes: z.string().max(500).nullable().optional(),
        usedInProject: z.boolean().default(false),
        usedAt: z.string().nullable().optional(),
        usedNote: z.string().max(2000).nullable().optional(),
        notes: z.string().max(2000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const row = {
      client_uid: data.clientUid,
      module_id: data.moduleId,
      held_at: data.heldAt.slice(0, 10),
      contact_id: data.contactId ?? null,
      participantes: data.participantes?.trim() || null,
      used_in_project: data.usedInProject,
      used_at: data.usedInProject ? data.usedAt?.slice(0, 10) || data.heldAt.slice(0, 10) : null,
      used_note: data.usedInProject ? data.usedNote?.trim() || null : null,
      notes: data.notes?.trim() || null,
    };
    const { error } = data.id
      ? await supabase.from("cs_masterclass_participations").update(row).eq("id", data.id)
      : await supabase
          .from("cs_masterclass_participations")
          .insert({ ...row, analista_id: userId, created_by: userId });
    if (error) throw new Error(error.message);
    if (!data.id) {
      const { getMasterclassConfig } = await import("@/lib/cs/cs-core.server");
      const cfg = await getMasterclassConfig(supabase);
      const mod = cfg.modulos.find((m) => m.id === data.moduleId);
      await supabase.from("cs_timeline_events").insert({
        client_uid: data.clientUid,
        author_id: userId,
        event_type: "masterclass",
        channel: "masterclass",
        title: `Masterclass — Módulo ${data.moduleId}${mod ? `: ${mod.nome}` : ""}`,
        description: row.participantes ? `Participantes: ${row.participantes}` : null,
        occurred_at: new Date(`${row.held_at}T12:00:00`).toISOString(),
        metadata: { module_id: data.moduleId },
      });
    }
    const { getMasterclassConfig } = await import("@/lib/cs/cs-core.server");
    const milestones = await refreshMasterclassMilestones(
      supabase,
      data.clientUid,
      userId,
      await getMasterclassConfig(supabase),
    );
    return { ok: true, milestones };
  });

export const deleteCsMasterclassParticipation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), clientUid: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("cs_masterclass_participations")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    const { getMasterclassConfig } = await import("@/lib/cs/cs-core.server");
    await refreshMasterclassMilestones(
      supabase,
      data.clientUid,
      userId,
      await getMasterclassConfig(supabase),
    );
    return { ok: true };
  });
