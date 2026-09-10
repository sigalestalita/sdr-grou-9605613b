import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getCalendlyMe, listCalendlyEvents } from "@/lib/cs/calendly.server";

export type CsAccess = { isManager: boolean; inCs: boolean };

/** Slugs dos times que habilitam o módulo CS (o padrão "cs" e os criados pela gestão). */
async function csTeamSlugs(): Promise<Set<string>> {
  const { data } = await supabaseAdmin
    .from("teams")
    .select("slug")
    .eq("modulo", "cs")
    .eq("ativo", true);
  const set = new Set((data ?? []).map((t) => t.slug as string));
  set.add("cs");
  return set;
}

/** Gestor/super admin ou membro do time de CS. */
export async function assertCsAccess(userId: string): Promise<CsAccess> {
  const [{ data: roles }, { data: teams }, csSlugs] = await Promise.all([
    supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
    supabaseAdmin.from("user_teams").select("team").eq("user_id", userId),
    csTeamSlugs(),
  ]);
  const roleList = (roles ?? []).map((r) => r.role as string);
  const isManager = roleList.includes("super_admin") || roleList.includes("gestao");
  const inCs = (teams ?? []).some((t) => csSlugs.has(t.team as string));
  // executivo comercial entra para vincular a própria agenda (convites do SDR)
  const isExecutivo = roleList.includes("executivo");
  if (!isManager && !inCs && !isExecutivo)
    throw new Error("Acesso restrito ao time de Customer Success");
  return { isManager, inCs };
}

export type IntegrationStatus = {
  userId: string;
  name: string;
  email: string | null;
  calendlyConnected: boolean;
  calendlyName: string | null;
  calendlyEmail: string | null;
  calendlyLastSyncAt: string | null;
  calendlyLastError: string | null;
  gcalConnected: boolean;
  gcalEmail: string | null;
  gcalLastSyncAt: string | null;
  gcalLastError: string | null;
  mailbox: string | null;
  meetingUrl: string | null;
};

/** Status das integrações (nunca devolve tokens). */
export async function listIntegrationStatus(userIds?: string[]): Promise<IntegrationStatus[]> {
  let q = supabaseAdmin
    .from("cs_user_integrations")
    .select(
      "user_id, calendly_user_uri, calendly_name, calendly_email, calendly_last_sync_at, calendly_last_error, email_address, gcal_ics_url, gcal_email, gcal_last_sync_at, gcal_last_error, meeting_url",
    );
  if (userIds?.length) q = q.in("user_id", userIds);
  const [{ data: rows, error }, { data: profiles }] = await Promise.all([
    q,
    supabaseAdmin.from("profiles").select("id, full_name, email"),
  ]);
  if (error) throw new Error(error.message);
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  return (rows ?? []).map((r) => {
    const p = profileById.get(r.user_id);
    return {
      userId: r.user_id,
      name: p?.full_name || p?.email || r.user_id,
      email: p?.email ?? null,
      calendlyConnected: !!r.calendly_user_uri,
      calendlyName: r.calendly_name,
      calendlyEmail: r.calendly_email,
      calendlyLastSyncAt: r.calendly_last_sync_at,
      calendlyLastError: r.calendly_last_error,
      gcalConnected: !!r.gcal_ics_url,
      gcalEmail: r.gcal_email,
      gcalLastSyncAt: r.gcal_last_sync_at,
      gcalLastError: r.gcal_last_error,
      mailbox: r.email_address,
      meetingUrl: (r as { meeting_url?: string | null }).meeting_url ?? null,
    };
  });
}

/** Pessoas elegíveis do CS (time cs, gestão ou super admin) para o gestor vincular agendas. */
export async function listCsTeamUsers(): Promise<
  Array<{ userId: string; name: string; email: string | null }>
> {
  const [{ data: teams }, { data: roles }, { data: profiles }, csSlugs] = await Promise.all([
    supabaseAdmin.from("user_teams").select("user_id, team"),
    supabaseAdmin.from("user_roles").select("user_id, role"),
    supabaseAdmin.from("profiles").select("id, full_name, email"),
    csTeamSlugs(),
  ]);
  const ids = new Set(
    (teams ?? []).filter((t) => csSlugs.has(t.team as string)).map((t) => t.user_id),
  );
  for (const r of roles ?? [])
    if (r.role === "super_admin" || r.role === "gestao" || r.role === "executivo")
      ids.add(r.user_id);
  return (profiles ?? [])
    .filter((p) => ids.has(p.id))
    .map((p) => ({ userId: p.id, name: p.full_name || p.email || p.id, email: p.email }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

/** Valida o token pessoal e salva a conexão do usuário. */
export async function connectCalendly(userId: string, token: string) {
  const me = await getCalendlyMe(token);
  const { error } = await supabaseAdmin.from("cs_user_integrations").upsert(
    {
      user_id: userId,
      calendly_token: token,
      calendly_user_uri: me.uri,
      calendly_org_uri: me.organization,
      calendly_name: me.name,
      calendly_email: me.email,
      calendly_connected_at: new Date().toISOString(),
      calendly_last_error: null,
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(error.message);
  return { name: me.name, email: me.email };
}

export async function disconnectCalendly(userId: string) {
  const { error } = await supabaseAdmin
    .from("cs_user_integrations")
    .update({
      calendly_token: null,
      calendly_user_uri: null,
      calendly_org_uri: null,
      calendly_name: null,
      calendly_email: null,
      calendly_connected_at: null,
      calendly_last_sync_at: null,
      calendly_last_error: null,
    })
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  await supabaseAdmin.from("cs_calendly_events").delete().eq("user_id", userId);
  return { ok: true };
}

export async function saveMailbox(userId: string, mailbox: string | null) {
  const { error } = await supabaseAdmin.from("cs_user_integrations").upsert(
    {
      user_id: userId,
      email_address: mailbox,
      email_connected_at: mailbox ? new Date().toISOString() : null,
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(error.message);
  return { ok: true };
}

/** Sincroniza a agenda de um ou de todos os usuários conectados. */
export async function syncCalendly(userIds: string[] | null, days = 120, pastDays = 365) {
  let q = supabaseAdmin
    .from("cs_user_integrations")
    .select("user_id, calendly_token, calendly_user_uri")
    .not("calendly_token", "is", null);
  if (userIds?.length) q = q.in("user_id", userIds);
  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);

  const minStart = new Date(Date.now() - pastDays * 86400000).toISOString();
  const maxStart = new Date(Date.now() + days * 86400000).toISOString();
  let events = 0;
  const failures: string[] = [];

  for (const row of rows ?? []) {
    if (!row.calendly_token || !row.calendly_user_uri) continue;
    try {
      const list = await listCalendlyEvents(
        row.calendly_token,
        row.calendly_user_uri,
        minStart,
        maxStart,
      );
      if (list.length) {
        const { error: upErr } = await supabaseAdmin.from("cs_calendly_events").upsert(
          list.map((e) => ({
            ...e,
            raw: e.raw as never,
            user_id: row.user_id,
            synced_at: new Date().toISOString(),
          })),
          { onConflict: "event_uri" },
        );
        if (upErr) throw new Error(upErr.message);
      }
      events += list.length;
      await supabaseAdmin
        .from("cs_user_integrations")
        .update({ calendly_last_sync_at: new Date().toISOString(), calendly_last_error: null })
        .eq("user_id", row.user_id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      failures.push(msg);
      await supabaseAdmin
        .from("cs_user_integrations")
        .update({ calendly_last_error: msg })
        .eq("user_id", row.user_id);
    }
  }

  return { users: (rows ?? []).length, events, failures };
}

/** Token da URL pública de recebimento de e-mails redirecionados. */
export async function getInboundToken(create = true): Promise<string> {
  const { data } = await supabaseAdmin
    .from("cs_settings")
    .select("value")
    .eq("key", "email_inbound")
    .maybeSingle();
  const current = (data?.value as { token?: string } | null)?.token;
  if (current) return current;
  if (!create) return "";
  return rotateInboundToken();
}

export async function rotateInboundToken(): Promise<string> {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const { error } = await supabaseAdmin
    .from("cs_settings")
    .upsert({ key: "email_inbound", value: { token } }, { onConflict: "key" });
  if (error) throw new Error(error.message);
  return token;
}

export type InboundEmail = {
  messageId?: string | null;
  from?: string | null;
  fromName?: string | null;
  to?: string[] | null;
  cc?: string[] | null;
  subject?: string | null;
  text?: string | null;
  html?: string | null;
  receivedAt?: string | null;
  mailbox?: string | null;
};

function emailDomain(address: string | null | undefined): string | null {
  if (!address) return null;
  const at = address.lastIndexOf("@");
  return at === -1 ? null : address.slice(at + 1).toLowerCase();
}

const FREE_MAIL = ["gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "icloud.com"];

/** Cliente dono de um endereço: contato exato, senão domínio corporativo. */
async function clientForAddress(address: string | null): Promise<string | null> {
  if (!address) return null;
  const { data: contact } = await supabaseAdmin
    .from("cs_contacts")
    .select("client_uid")
    .ilike("email", address)
    .limit(1);
  if (contact?.[0]?.client_uid) return contact[0].client_uid;
  const domain = emailDomain(address);
  if (!domain || FREE_MAIL.includes(domain)) return null;
  const { data: byDomain } = await supabaseAdmin
    .from("cs_contacts")
    .select("client_uid")
    .ilike("email", `%@${domain}`)
    .limit(1);
  return byDomain?.[0]?.client_uid ?? null;
}

/**
 * Grava um e-mail redirecionado e tenta vincular ao cliente e ao responsável.
 * Se o remetente é uma caixa vinculada do time, o e-mail é um ENVIO
 * (direction = outbound) e o cliente é procurado nos destinatários — é essa
 * linha que serve de evidência para concluir tarefas de e-mail.
 */
export async function storeInboundEmail(payload: InboundEmail) {
  const from = (payload.from ?? "").toLowerCase().trim() || null;
  const to = (payload.to ?? []).map((t) => t.toLowerCase().trim()).filter(Boolean);
  const cc = (payload.cc ?? []).map((c) => c.toLowerCase().trim()).filter(Boolean);

  const { data: teamBoxes } = await supabaseAdmin
    .from("cs_user_integrations")
    .select("user_id, email_address")
    .not("email_address", "is", null);
  const boxOwner = new Map(
    (teamBoxes ?? []).map((b) => [String(b.email_address).toLowerCase(), b.user_id] as const),
  );
  const outbound = !!from && boxOwner.has(from);
  const mailbox =
    (outbound
      ? from
      : (payload.mailbox ?? to.find((t) => boxOwner.has(t)) ?? to[0] ?? null)
    )?.toLowerCase() ?? null;

  let clientUid: string | null = null;
  if (outbound) {
    for (const addr of [...to, ...cc]) {
      if (boxOwner.has(addr)) continue;
      clientUid = await clientForAddress(addr);
      if (clientUid) break;
    }
  } else {
    clientUid = await clientForAddress(from);
  }

  let ownerUserId: string | null = mailbox ? (boxOwner.get(mailbox) ?? null) : null;
  if (!ownerUserId && clientUid) {
    const { data: client } = await supabaseAdmin
      .from("cs_clients")
      .select("cs_responsavel_id")
      .eq("client_uid", clientUid)
      .maybeSingle();
    ownerUserId = client?.cs_responsavel_id ?? null;
  }

  const text = payload.text ?? null;
  const snippet = (text ?? payload.html ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);

  const { error } = await supabaseAdmin.from("cs_emails").upsert(
    {
      message_id: payload.messageId ?? `${from ?? "?"}-${payload.receivedAt ?? Date.now()}`,
      direction: outbound ? "outbound" : "inbound",
      from_email: from,
      from_name: payload.fromName ?? null,
      to_emails: to,
      cc_emails: cc,
      subject: payload.subject ?? null,
      snippet,
      body_text: text,
      body_html: payload.html ?? null,
      received_at: payload.receivedAt ?? new Date().toISOString(),
      client_uid: clientUid,
      owner_user_id: ownerUserId,
      mailbox,
      raw: payload as never,
    },
    { onConflict: "message_id" },
  );
  if (error) throw new Error(error.message);
  return { ok: true, clientUid, ownerUserId, direction: outbound ? "outbound" : "inbound" };
}

// ---------------------------------------------------------------------------
// Google Agenda por usuário (endereço iCal privado)
// ---------------------------------------------------------------------------

export async function connectGoogleCalendar(userId: string, icsUrl: string) {
  const { validateIcsUrl, emailFromIcsUrl, fetchGoogleCalendar } =
    await import("@/lib/cs/gcal.server");
  const url = validateIcsUrl(icsUrl);
  // valida baixando uma vez
  await fetchGoogleCalendar(url, new Date(Date.now() - 86400000), new Date(Date.now() + 86400000));
  const email = emailFromIcsUrl(url);
  const { error } = await supabaseAdmin.from("cs_user_integrations").upsert(
    {
      user_id: userId,
      gcal_ics_url: url,
      gcal_email: email,
      gcal_connected_at: new Date().toISOString(),
      gcal_last_error: null,
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(error.message);
  return { email };
}

export async function disconnectGoogleCalendar(userId: string) {
  const { error } = await supabaseAdmin
    .from("cs_user_integrations")
    .update({
      gcal_ics_url: null,
      gcal_email: null,
      gcal_connected_at: null,
      gcal_last_sync_at: null,
      gcal_last_error: null,
    })
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  await supabaseAdmin
    .from("cs_calendly_events")
    .delete()
    .eq("user_id", userId)
    .eq("provider", "google");
  return { ok: true };
}

/** Baixa a agenda Google de cada pessoa e espelha em cs_calendly_events (provider google). */
export async function syncGoogleCalendars(userIds: string[] | null, days = 60, pastDays = 120) {
  const { fetchGoogleCalendar } = await import("@/lib/cs/gcal.server");
  let q = supabaseAdmin
    .from("cs_user_integrations")
    .select("user_id, gcal_ics_url, gcal_email")
    .not("gcal_ics_url", "is", null);
  if (userIds?.length) q = q.in("user_id", userIds);
  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);

  const from = new Date(Date.now() - pastDays * 86400000);
  const to = new Date(Date.now() + days * 86400000);
  let events = 0;
  const failures: string[] = [];
  for (const row of rows ?? []) {
    if (!row.gcal_ics_url) continue;
    try {
      const list = await fetchGoogleCalendar(row.gcal_ics_url, from, to);
      const me = row.gcal_email?.toLowerCase() ?? null;
      const prepared = list.map((e) => {
        // convidado "principal": primeiro que não é o próprio analista nem organizador interno
        const guest =
          e.attendees.find((a) => a.email !== me && a.email !== e.organizer_email) ?? null;
        return {
          ...e,
          provider: "google",
          invitee_email: guest?.email ?? null,
          invitee_name: guest?.name ?? null,
          attendees: e.attendees as never,
          raw: e.raw as never,
          user_id: row.user_id,
          synced_at: new Date().toISOString(),
        };
      });
      for (let i = 0; i < prepared.length; i += 200) {
        const { error: upErr } = await supabaseAdmin
          .from("cs_calendly_events")
          .upsert(prepared.slice(i, i + 200), { onConflict: "event_uri" });
        if (upErr) throw new Error(upErr.message);
      }
      // eventos que sumiram da agenda (apagados) na janela: marca cancelados
      const keep = new Set(prepared.map((p) => p.event_uri));
      const { data: existing } = await supabaseAdmin
        .from("cs_calendly_events")
        .select("id, event_uri")
        .eq("user_id", row.user_id)
        .eq("provider", "google")
        .gte("start_time", from.toISOString())
        .lte("start_time", to.toISOString());
      const gone = (existing ?? []).filter((x) => !keep.has(x.event_uri)).map((x) => x.id);
      if (gone.length)
        await supabaseAdmin
          .from("cs_calendly_events")
          .update({ status: "canceled" })
          .in("id", gone);
      events += prepared.length;
      await supabaseAdmin
        .from("cs_user_integrations")
        .update({ gcal_last_sync_at: new Date().toISOString(), gcal_last_error: null })
        .eq("user_id", row.user_id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      failures.push(msg);
      await supabaseAdmin
        .from("cs_user_integrations")
        .update({ gcal_last_error: msg })
        .eq("user_id", row.user_id);
    }
  }
  return { users: (rows ?? []).length, events, failures };
}

/** Calendly + Google Agenda e, em seguida, liquida as reuniões já terminadas. */
export async function syncAgendas(userIds: string[] | null) {
  const [c, g] = await Promise.all([syncCalendly(userIds), syncGoogleCalendars(userIds)]);
  const { data: settled } = await supabaseAdmin.rpc("cs_settle_meetings");
  return {
    users: c.users + g.users,
    events: c.events + g.events,
    failures: [...c.failures, ...g.failures],
    settled: Number(settled ?? 0),
  };
}
