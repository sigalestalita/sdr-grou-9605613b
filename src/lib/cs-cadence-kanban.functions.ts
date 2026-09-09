import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CadenceTaskRow = {
  id: string;
  clientUid: string;
  weekStart: string;
  weekday: number;
  ownerId: string | null;
  title: string;
  urgency: string;
  color: string;
  done: boolean;
  doneAt: string | null;
  notes: string | null;
  /** Canal planejado; e-mail/WhatsApp só concluem pelo registro do canal. */
  channel: string | null;
  doneVia: "evidencia" | "manual" | "gestor" | null;
};

/** Tarefas de cadência (checklist do kanban semanal) de uma semana. */
export const listCadenceTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ weekStart: z.string().min(8) }).parse(d))
  .handler(async ({ data, context }): Promise<CadenceTaskRow[]> => {
    const { data: rows, error } = await context.supabase
      .from("cs_cadence_tasks")
      .select(
        "id, client_uid, week_start, weekday, owner_id, title, urgency, color, done, done_at, notes, channel, done_via",
      )
      .eq("week_start", data.weekStart);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      id: r.id as string,
      clientUid: r.client_uid as string,
      weekStart: r.week_start as string,
      weekday: Number(r.weekday ?? 1),
      ownerId: (r.owner_id as string) ?? null,
      title: (r.title as string) ?? "",
      urgency: (r.urgency as string) ?? "normal",
      color: (r.color as string) ?? "sem_dado",
      done: Boolean(r.done),
      doneAt: (r.done_at as string) ?? null,
      notes: (r.notes as string) ?? null,
      channel: (r.channel as string) ?? null,
      doneVia: (r.done_via as "evidencia" | "manual" | "gestor" | null) ?? null,
    }));
  });

/** Cria/atualiza a tarefa da semana de um cliente (dia planejado, conclusão, notas). */
export const upsertCadenceTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        clientUid: z.string().min(1),
        weekStart: z.string().min(8),
        weekday: z.number().int().min(1).max(5).optional(),
        ownerId: z.string().uuid().nullable().optional(),
        title: z.string().optional(),
        urgency: z.string().optional(),
        color: z.string().optional(),
        done: z.boolean().optional(),
        notes: z.string().nullable().optional(),
        channel: z.enum(["email", "whatsapp", "ligacao", "reuniao", "outro"]).nullable().optional(),
        /** Gestão concluindo ação de canal com justificativa em notes. */
        asManager: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {
      client_uid: data.clientUid,
      week_start: data.weekStart,
      created_by: context.userId,
    };
    if (data.weekday !== undefined) patch["weekday"] = data.weekday;
    if (data.ownerId !== undefined) patch["owner_id"] = data.ownerId;
    if (data.title !== undefined) patch["title"] = data.title;
    if (data.urgency !== undefined) patch["urgency"] = data.urgency;
    if (data.color !== undefined) patch["color"] = data.color;
    if (data.notes !== undefined) patch["notes"] = data.notes;
    if (data.channel !== undefined) patch["channel"] = data.channel;
    if (data.done !== undefined) {
      patch["done"] = data.done;
      patch["done_at"] = data.done ? new Date().toISOString() : null;
      patch["done_by"] = data.done ? context.userId : null;
      patch["done_via"] = data.done ? (data.asManager ? "gestor" : "manual") : null;
    }

    const { error } = await context.supabase
      .from("cs_cadence_tasks")
      .upsert(patch as never, { onConflict: "client_uid,week_start" });
    // O trigger cs_cadence_guard_manual recusa check manual em ação de e-mail/WhatsApp.
    if (error) throw new Error(error.message.replace(/^.*?(Tarefa de|Ação de)/, "$1"));

    // Concluir a ação também registra o contato na timeline do cliente.
    if (data.done) {
      await context.supabase.from("cs_timeline_events").insert({
        client_uid: data.clientUid,
        author_id: context.userId,
        event_type: "cadencia",
        title: data.title?.slice(0, 180) || "Ação de cadência concluída",
        description: data.notes ?? null,
        occurred_at: new Date().toISOString(),
        metadata: { source: "cadencia_kanban", week_start: data.weekStart } as never,
      } as never);
    }
    return { ok: true };
  });
