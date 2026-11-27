import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Status das integrações (agenda Calendly + caixa de e-mail) do time de CS. */
export const listCsIntegrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertCsAccess, listIntegrationStatus, getInboundToken, listCsTeamUsers } =
      await import("@/lib/cs/integrations.server");
    const access = await assertCsAccess(context.userId);
    const all = await listIntegrationStatus();
    const mine = all.find((i) => i.userId === context.userId) ?? null;
    return {
      isManager: access.isManager,
      mine,
      users: access.isManager ? all : mine ? [mine] : [],
      teamUsers: access.isManager ? await listCsTeamUsers() : [],
      inboundToken: access.isManager ? await getInboundToken() : null,
    };
  });

export const connectCsCalendly = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { token: string; userId?: string }) =>
    z.object({ token: z.string().min(10), userId: z.string().uuid().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertCsAccess, connectCalendly, syncCalendly } =
      await import("@/lib/cs/integrations.server");
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

/** Sincroniza Calendly + Google Agenda e liquida as reuniões terminadas. */
export const syncCsCalendly = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { all?: boolean }) => z.object({ all: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { assertCsAccess, syncAgendas } = await import("@/lib/cs/integrations.server");
    const access = await assertCsAccess(context.userId);
    const scope = data.all && access.isManager ? null : [context.userId];
    return syncAgendas(scope);
  });

/** Vincula a Google Agenda (endereço iCal privado) ao login — o gestor pode fazer por outra pessoa. */
export const connectCsGoogleCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { icsUrl: string; userId?: string }) =>
    z
      .object({ icsUrl: z.string().min(20).max(500), userId: z.string().uuid().optional() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertCsAccess, connectGoogleCalendar, syncAgendas } =
      await import("@/lib/cs/integrations.server");
    const access = await assertCsAccess(context.userId);
    const targetId = data.userId && data.userId !== context.userId ? data.userId : context.userId;
    if (targetId !== context.userId && !access.isManager)
      throw new Error("Apenas gestores podem vincular a agenda de outra pessoa");
    const r = await connectGoogleCalendar(targetId, data.icsUrl);
    const sync = await syncAgendas([targetId]);
    return { ...r, events: sync.events, settled: sync.settled };
  });

export const disconnectCsGoogleCalendar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId?: string } | undefined) =>
    z.object({ userId: z.string().uuid().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { assertCsAccess, disconnectGoogleCalendar } =
      await import("@/lib/cs/integrations.server");
    const access = await assertCsAccess(context.userId);
    const targetId = data.userId && data.userId !== context.userId ? data.userId : context.userId;
    if (targetId !== context.userId && !access.isManager)
      throw new Error("Apenas gestores podem desconectar a agenda de outra pessoa");
    return disconnectGoogleCalendar(targetId);
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
      .select("*, cs_clients:client_uid(nome_empresa), cs_contacts:contact_id(nome)")
      .gte("start_time", data.from)
      .lte("start_time", data.to)
      .order("start_time");
    if (!access.isManager) q = q.eq("user_id", context.userId);
    else if (data.userId) q = q.eq("user_id", data.userId);
    const { data: events, error } = await q;
    if (error) throw new Error(error.message);

    // Reuniões marcadas no Compass (pela ficha ou pela agenda).
    let qr = (supabase as unknown as import("@supabase/supabase-js").SupabaseClient)
      .from("cs_meetings")
      .select(
        "id, client_uid, title, occurred_at, duration_minutes, status, owner_user_id, meeting_url, contact_id, google_event_id, cs_clients:client_uid(nome_empresa), cs_contacts:contact_id(nome, email)",
      )
      .gte("occurred_at", data.from)
      .lte("occurred_at", data.to)
      .order("occurred_at");
    if (!access.isManager) qr = qr.eq("owner_user_id", context.userId);
    else if (data.userId) qr = qr.eq("owner_user_id", data.userId);
    const { data: reunioesRaw, error: errR } = await qr;
    if (errR) throw new Error(errR.message);
    const reunioes = (
      (reunioesRaw ?? []) as unknown as Array<{
        id: string;
        client_uid: string;
        title: string;
        occurred_at: string;
        duration_minutes: number | null;
        status: string | null;
        owner_user_id: string | null;
        meeting_url: string | null;
        contact_id: string | null;
        cs_clients: { nome_empresa: string | null } | null;
        cs_contacts: { nome: string | null; email: string | null } | null;
      }>
    ).map((r) => ({
      id: r.id,
      clientUid: r.client_uid,
      clienteNome: r.cs_clients?.nome_empresa ?? null,
      contatoNome: r.cs_contacts?.nome ?? null,
      contatoEmail: r.cs_contacts?.email ?? null,
      titulo: r.title,
      inicio: r.occurred_at,
      duracao: r.duration_minutes,
      status: r.status ?? "realizada",
      ownerId: r.owner_user_id,
      meetingUrl: r.meeting_url,
    }));

    /*
     * A reunião criada pelo Compass no Google volta pela leitura do iCal: o
     * UID do iCal é "<id do evento>@google.com". Mostra só a do Compass.
     */
    const doCompass = new Set(
      ((reunioesRaw ?? []) as Array<{ google_event_id?: string | null }>)
        .map((r) => r.google_event_id)
        .filter((x): x is string => !!x),
    );
    const eventos = (events ?? []).filter((e) => {
      const uid = String((e as { raw?: { uid?: string } }).raw?.uid ?? "").split("@")[0];
      return !uid || !doCompass.has(uid);
    });

    // Donos de agenda: quem tem eventos registrados (Calendly ou simulados) + integrações vinculadas.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: ownerRows }, { data: profiles }] = await Promise.all([
      supabaseAdmin.from("cs_calendly_events").select("user_id"),
      supabaseAdmin.from("profiles").select("id, full_name, email"),
    ]);
    const nameById = new Map(
      (profiles ?? []).map((p) => [p.id as string, (p.full_name || p.email || p.id) as string]),
    );
    const ownerIds = Array.from(
      new Set([
        ...(ownerRows ?? []).map((r) => r.user_id as string),
        ...reunioes.map((r) => r.ownerId).filter((x): x is string => !!x),
      ]),
    );
    const owners = ownerIds
      .map((id) => ({ userId: id, name: nameById.get(id) ?? id }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return {
      isManager: access.isManager,
      events: eventos,
      reunioes,
      users: await listIntegrationStatus(),
      owners,
    };
  });

/** E-mails recebidos por redirecionamento. */
export const listCsEmails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { clientUid?: string; userId?: string; q?: string }) =>
    z
      .object({
        clientUid: z.string().optional(),
        userId: z.string().optional(),
        q: z.string().optional(),
      })
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
    if (data.q)
      q = q.or(`subject.ilike.%${data.q}%,from_email.ilike.%${data.q}%,snippet.ilike.%${data.q}%`);
    const { data: emails, error } = await q;
    if (error) throw new Error(error.message);
    return {
      isManager: access.isManager,
      emails: emails ?? [],
      users: await listIntegrationStatus(),
    };
  });
