import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CS_TASK_TYPES, type CsTaskType } from "@/lib/cs-types";

/*
 * Tarefas do CS (cs_tasks). Tarefas de e-mail e WhatsApp não têm "check"
 * manual: o banco as conclui quando o canal vinculado registra um envio para
 * o cliente (trigger cs_apply_evidence). O que está aqui só cria, edita,
 * cancela e — para ligação/reunião/outro — conclui à mão. A gestão pode
 * concluir tarefa de canal com justificativa (completed_via = 'gestor').
 */

export type CsTask = {
  id: string;
  clientUid: string;
  clientName: string;
  contactId: string | null;
  contactName: string | null;
  ownerId: string | null;
  ownerName: string;
  title: string;
  taskType: CsTaskType;
  dueAt: string;
  status: "pendente" | "concluida" | "cancelada";
  doneAt: string | null;
  doneBy: string | null;
  completedVia: "evidencia" | "manual" | "gestor" | null;
  evidenceAt: string | null;
  evidenceTitle: string | null;
  notes: string | null;
  source: string;
  createdAt: string;
};

const taskSelect =
  "id, client_uid, contact_id, owner_id, title, task_type, due_at, status, done_at, done_by, completed_via, evidence_at, evidence_event_id, notes, source, created_at, cs_clients(nome_empresa), cs_contacts(nome), cs_timeline_events(title)";

type Raw = {
  id: string;
  client_uid: string;
  contact_id: string | null;
  owner_id: string | null;
  title: string;
  task_type: string;
  due_at: string;
  status: string;
  done_at: string | null;
  done_by: string | null;
  completed_via: string | null;
  evidence_at: string | null;
  notes: string | null;
  source: string;
  created_at: string;
  cs_clients: { nome_empresa: string } | null;
  cs_contacts: { nome: string } | null;
  cs_timeline_events: { title: string } | null;
};

function toTask(r: Raw, nameById: Map<string, string>): CsTask {
  return {
    id: r.id,
    clientUid: r.client_uid,
    clientName: r.cs_clients?.nome_empresa ?? r.client_uid,
    contactId: r.contact_id,
    contactName: r.cs_contacts?.nome ?? null,
    ownerId: r.owner_id,
    ownerName: r.owner_id ? (nameById.get(r.owner_id) ?? "—") : "Sem responsável",
    title: r.title,
    taskType: (CS_TASK_TYPES as readonly string[]).includes(r.task_type)
      ? (r.task_type as CsTaskType)
      : "outro",
    dueAt: r.due_at,
    status: r.status as CsTask["status"],
    doneAt: r.done_at,
    doneBy: r.done_by,
    completedVia: (r.completed_via as CsTask["completedVia"]) ?? null,
    evidenceAt: r.evidence_at,
    evidenceTitle: r.cs_timeline_events?.title ?? null,
    notes: r.notes,
    source: r.source,
    createdAt: r.created_at,
  };
}

/** Tarefas por cliente, responsável, situação ou período (RLS por carteira). */
export const listCsTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        clientUid: z.string().optional(),
        ownerId: z.string().uuid().nullable().optional(),
        status: z.enum(["pendente", "concluida", "cancelada", "todas"]).default("todas"),
        from: z.string().optional(),
        to: z.string().optional(),
        limit: z.number().int().min(1).max(500).default(200),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("cs_tasks")
      .select(taskSelect)
      .order("due_at", { ascending: true })
      .limit(data.limit);
    if (data.clientUid) q = q.eq("client_uid", data.clientUid);
    if (data.ownerId) q = q.eq("owner_id", data.ownerId);
    if (data.status !== "todas") q = q.eq("status", data.status);
    if (data.from) q = q.gte("due_at", new Date(data.from).toISOString());
    if (data.to) q = q.lte("due_at", new Date(data.to).toISOString());
    const [{ data: rows, error }, { data: profiles }] = await Promise.all([
      q,
      supabase.from("profiles").select("id, full_name, email"),
    ]);
    if (error) throw new Error(error.message);
    const nameById = new Map(
      (profiles ?? []).map((p) => [p.id, p.full_name || p.email || "—"] as const),
    );
    return { tasks: ((rows ?? []) as unknown as Raw[]).map((r) => toTask(r, nameById)) };
  });

/** Opções para criar tarefa: clientes visíveis (busca), contatos do cliente e pessoas. */
export const getCsTaskOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ clientUid: z.string().optional(), q: z.string().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const term = (data.q ?? "").trim();
    let clientsQ = supabase
      .from("cs_clients")
      .select("client_uid, nome_empresa")
      .eq("ativo", true)
      .order("nome_empresa")
      .limit(20);
    if (term) clientsQ = clientsQ.ilike("nome_empresa", `%${term}%`);
    const [clients, contacts, profiles] = await Promise.all([
      data.clientUid ? Promise.resolve({ data: [] }) : clientsQ,
      data.clientUid
        ? supabase
            .from("cs_contacts")
            .select("id, nome, email, whatsapp")
            .eq("client_uid", data.clientUid)
            .order("nome")
        : Promise.resolve({ data: [] }),
      supabase.from("profiles").select("id, full_name, email").order("full_name"),
    ]);
    return {
      currentUserId: userId,
      clients: (clients.data ?? []) as { client_uid: string; nome_empresa: string }[],
      contacts: (contacts.data ?? []) as {
        id: string;
        nome: string;
        email: string | null;
        whatsapp: string | null;
      }[],
      profiles: (profiles.data ?? []).map((p) => ({
        id: p.id,
        name: p.full_name || p.email || "—",
      })),
    };
  });

/** Cria ou edita uma tarefa (título, tipo, prazo, responsável, contato). */
export const saveCsTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        clientUid: z.string().min(1),
        contactId: z.string().uuid().nullable().optional(),
        ownerId: z.string().uuid().nullable().optional(),
        title: z.string().min(1).max(200),
        taskType: z.enum(CS_TASK_TYPES),
        dueAt: z.string().min(1),
        notes: z.string().max(2000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const row = {
      client_uid: data.clientUid,
      contact_id: data.contactId ?? null,
      owner_id: data.ownerId === undefined ? userId : data.ownerId,
      title: data.title.trim(),
      task_type: data.taskType,
      due_at: new Date(data.dueAt).toISOString(),
      notes: data.notes ?? null,
    };
    if (data.id) {
      const { error } = await supabase.from("cs_tasks").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: created, error } = await supabase
      .from("cs_tasks")
      .insert({ ...row, created_by: userId, source: "manual" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: created.id as string };
  });

/**
 * Conclui à mão. Para tarefa de canal exigido (e-mail/WhatsApp) o banco recusa,
 * a não ser que a gestão conclua com justificativa (asManager + notes).
 */
export const completeCsTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        notes: z.string().max(2000).nullable().optional(),
        asManager: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: task, error: readErr } = await supabase
      .from("cs_tasks")
      .select("id, client_uid, title, task_type, notes")
      .eq("id", data.id)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!task) throw new Error("Tarefa não encontrada");
    const now = new Date().toISOString();
    const notes = data.notes?.trim() || task.notes || null;
    const { error } = await supabase
      .from("cs_tasks")
      .update({
        status: "concluida",
        done_at: now,
        done_by: userId,
        completed_via: data.asManager ? "gestor" : "manual",
        notes,
      })
      .eq("id", data.id);
    if (error) throw new Error(friendlyGuard(error.message));

    await supabase.from("cs_timeline_events").insert({
      client_uid: task.client_uid,
      author_id: userId,
      event_type: "tarefa_concluida",
      channel: task.task_type,
      title: `Tarefa concluída: ${task.title}`,
      description: data.asManager ? `Concluída pela gestão — ${notes ?? ""}`.trim() : notes,
      occurred_at: now,
      metadata: { task_id: task.id, completed_via: data.asManager ? "gestor" : "manual" },
    });
    if (task.task_type === "ligacao" || task.task_type === "reuniao") {
      await supabase
        .from("cs_clients")
        .update({ last_contact_at: now })
        .eq("client_uid", task.client_uid);
    }
    return { ok: true };
  });

/** Reabre, cancela ou apaga uma tarefa. */
export const setCsTaskStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        action: z.enum(["reabrir", "cancelar", "apagar"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (data.action === "apagar") {
      const { error } = await supabase.from("cs_tasks").delete().eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    const patch =
      data.action === "reabrir"
        ? {
            status: "pendente",
            done_at: null,
            done_by: null,
            completed_via: null,
            evidence_event_id: null,
            evidence_at: null,
          }
        : { status: "cancelada" };
    const { error } = await supabase.from("cs_tasks").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Mensagem do trigger de bloqueio sem o prefixo técnico do Postgres. */
export function friendlyGuard(message: string) {
  return message.replace(/^.*?(Tarefa de|Ação de)/, "$1");
}
