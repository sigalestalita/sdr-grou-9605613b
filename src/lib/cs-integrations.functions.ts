import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Status das integrações (agenda Calendly + caixa de e-mail) do time de CS. */
export const listCsIntegrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertCsAccess, listIntegrationStatus, getInboundToken } = await import(
      "@/lib/cs/integrations.server"
    );
    const access = await assertCsAccess(context.userId);
    const all = await listIntegrationStatus();
    const mine = all.find((i) => i.userId === context.userId) ?? null;
    return {
      isManager: access.isManager,
      mine,
      users: access.isManager ? all : mine ? [mine] : [],
      inboundToken: access.isManager ? await getInboundToken() : null,
    };
  });

export const connectCsCalendly = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { token: string; userId?: string }) =>
    z.object({ token: z.string().min(10), userId: z.string().uuid().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertCsAccess, connectCalendly, syncCalendly } = await import(
      "@/lib/cs/integrations.server"
    );
    const access = await assertCsAccess(context.userId);
    // Gestor pode vincular o token em nome de outra pessoa do time.
    const targetId =
      data.userId && data.userId !== context.userId
        ? (() => {
            if (!access.isManager)
              throw new Error("Apenas gestores podem vincular a agenda de outra pessoa");
            return data.userId;
          })()
        : context.userId;
    const me = await connectCalendly(targetId, data.token.trim());
    const sync = await syncCalendly([targetId]);
    return { ...me, events: sync.events };
  });

export const disconnectCsCalendly = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId?: string } | undefined) =>
    z.object({ userId: z.string().uuid().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { assertCsAccess, disconnectCalendly } = await import("@/lib/cs/integrations.server");
    const access = await assertCsAccess(context.userId);
    const targetId = data.userId && data.userId !== context.userId ? data.userId : context.userId;
    if (targetId !== context.userId && !access.isManager)
      throw new Error("Apenas gestores podem desconectar a agenda de outra pessoa");
    return disconnectCalendly(targetId);
  });

export const saveCsMailbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { mailbox: string }) => z.object({ mailbox: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { assertCsAccess, saveMailbox } = await import("@/lib/cs/integrations.server");
    await assertCsAccess(context.userId);
    return saveMailbox(context.userId, data.mailbox.trim().toLowerCase() || null);
  });

export const syncCsCalendly = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { all?: boolean }) => z.object({ all: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { assertCsAccess, syncCalendly } = await import("@/lib/cs/integrations.server");
    const access = await assertCsAccess(context.userId);
    const scope = data.all && access.isManager ? null : [context.userId];
    return syncCalendly(scope);
  });

export const rotateCsInboundToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertCsAccess, rotateInboundToken } = await import("@/lib/cs/integrations.server");
    const access = await assertCsAccess(context.userId);
    if (!access.isManager) throw new Error("Apenas gestores podem gerar um novo endereço");
    return { token: await rotateInboundToken() };
  });

/** Agenda consolidada: gestor vê todo mundo, demais veem a própria. */
export const listCsAgenda = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { from: string; to: string; userId?: string }) =>
    z.object({ from: z.string(), to: z.string(), userId: z.string().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertCsAccess, listIntegrationStatus } = await import("@/lib/cs/integrations.server");
    const access = await assertCsAccess(context.userId);
    const { supabase } = context;
    let q = supabase
      .from("cs_calendly_events")
      .select("*")
      .gte("start_time", data.from)
      .lte("start_time", data.to)
      .order("start_time");
    if (!access.isManager) q = q.eq("user_id", context.userId);
    else if (data.userId) q = q.eq("user_id", data.userId);
    const { data: events, error } = await q;
    if (error) throw new Error(error.message);
    return { isManager: access.isManager, events: events ?? [], users: await listIntegrationStatus() };
  });

/** E-mails recebidos por redirecionamento. */
export const listCsEmails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { clientUid?: string; userId?: string; q?: string }) =>
    z
      .object({ clientUid: z.string().optional(), userId: z.string().optional(), q: z.string().optional() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertCsAccess, listIntegrationStatus } = await import("@/lib/cs/integrations.server");
    const access = await assertCsAccess(context.userId);
    let q = context.supabase
      .from("cs_emails")
      .select("*")
      .order("received_at", { ascending: false })
      .limit(200);
    if (!access.isManager) q = q.eq("owner_user_id", context.userId);
    else if (data.userId) q = q.eq("owner_user_id", data.userId);
    if (data.clientUid) q = q.eq("client_uid", data.clientUid);
    if (data.q) q = q.or(`subject.ilike.%${data.q}%,from_email.ilike.%${data.q}%,snippet.ilike.%${data.q}%`);
    const { data: emails, error } = await q;
    if (error) throw new Error(error.message);
    return { isManager: access.isManager, emails: emails ?? [], users: await listIntegrationStatus() };
  });
