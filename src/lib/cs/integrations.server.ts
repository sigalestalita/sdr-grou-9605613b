import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getCalendlyMe, listCalendlyEvents } from "@/lib/cs/calendly.server";

export type CsAccess = { isManager: boolean; inCs: boolean };

/** Gestor/super admin ou membro do time de CS. */
export async function assertCsAccess(userId: string): Promise<CsAccess> {
  const [{ data: roles }, { data: teams }] = await Promise.all([
    supabaseAdmin.from("user_roles").select("role").eq("user_id", userId),
    supabaseAdmin.from("user_teams").select("team").eq("user_id", userId),
  ]);
  const roleList = (roles ?? []).map((r) => r.role as string);
  const isManager = roleList.includes("super_admin") || roleList.includes("gestao");
  const inCs = (teams ?? []).some((t) => t.team === "cs");
  if (!isManager && !inCs) throw new Error("Acesso restrito ao time de Customer Success");
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
  mailbox: string | null;
};

/** Status das integrações (nunca devolve tokens). */
export async function listIntegrationStatus(userIds?: string[]): Promise<IntegrationStatus[]> {
  let q = supabaseAdmin
    .from("cs_user_integrations")
    .select(
      "user_id, calendly_user_uri, calendly_name, calendly_email, calendly_last_sync_at, calendly_last_error, email_address",
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
      mailbox: r.email_address,
    };
  });
}

/** Pessoas elegíveis do CS (time cs, gestão ou super admin) para o gestor vincular agendas. */
export async function listCsTeamUsers(): Promise<Array<{ userId: string; name: string; email: string | null }>> {
  const [{ data: teams }, { data: roles }, { data: profiles }] = await Promise.all([
    supabaseAdmin.from("user_teams").select("user_id, team").eq("team", "cs"),
    supabaseAdmin.from("user_roles").select("user_id, role"),
    supabaseAdmin.from("profiles").select("id, full_name, email"),
  ]);
  const ids = new Set((teams ?? []).map((t) => t.user_id));
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

/** Grava um e-mail redirecionado e tenta vincular ao cliente e ao responsável. */
export async function storeInboundEmail(payload: InboundEmail) {
  const from = (payload.from ?? "").toLowerCase().trim() || null;
  const to = (payload.to ?? []).map((t) => t.toLowerCase().trim()).filter(Boolean);
  const mailbox = (payload.mailbox ?? to[0] ?? null)?.toLowerCase() ?? null;

  let clientUid: string | null = null;
  if (from) {
    const { data: contact } = await supabaseAdmin
      .from("cs_contacts")
      .select("client_uid")
      .ilike("email", from)
      .maybeSingle();
    clientUid = contact?.client_uid ?? null;
  }
  if (!clientUid) {
    const domain = emailDomain(from);
    if (domain && !["gmail.com", "hotmail.com", "outlook.com", "yahoo.com"].includes(domain)) {
      const { data: byDomain } = await supabaseAdmin
        .from("cs_contacts")
        .select("client_uid")
        .ilike("email", `%@${domain}`)
        .limit(1);
      clientUid = byDomain?.[0]?.client_uid ?? null;
    }
  }

  let ownerUserId: string | null = null;
  if (mailbox) {
    const { data: integ } = await supabaseAdmin
      .from("cs_user_integrations")
      .select("user_id")
      .ilike("email_address", mailbox)
      .maybeSingle();
    ownerUserId = integ?.user_id ?? null;
  }
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
      direction: "inbound",
      from_email: from,
      from_name: payload.fromName ?? null,
      to_emails: to,
      cc_emails: (payload.cc ?? []).map((c) => c.toLowerCase().trim()).filter(Boolean),
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
  return { ok: true, clientUid, ownerUserId };
}
