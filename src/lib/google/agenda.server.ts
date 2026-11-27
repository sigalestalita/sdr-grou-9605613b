import type { SupabaseClient } from "@supabase/supabase-js";
import { corpoDoEvento, urlDeAutorizacao, type EventoCompass } from "./agenda";

/*
 * Google Agenda com escrita, pelo OAuth de cada pessoa.
 *
 * As credenciais do app (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) ficam nos
 * secrets do Lovable Cloud. O refresh_token de cada pessoa fica em
 * google_agenda_contas, que só o service role lê.
 */
type Admin = SupabaseClient;
const API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export function configGoogle() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() || null;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || null;
  const base = (process.env.APP_PUBLIC_URL || "https://compass.grougp.com").replace(/\/+$/, "");
  return {
    pronto: !!clientId && !!clientSecret,
    clientId,
    clientSecret,
    redirectUri: `${base}/api/public/google/callback`,
    base,
  };
}

export async function iniciarAutorizacao(
  admin: Admin,
  userId: string,
  email: string | null,
  voltarPara: string,
) {
  const cfg = configGoogle();
  if (!cfg.pronto || !cfg.clientId)
    throw new Error("Integração com o Google ainda não configurada");
  const estado = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  // Estados velhos (mais de 1h) saem; o novo entra.
  await admin
    .from("google_agenda_estados")
    .delete()
    .lt("criado_em", new Date(Date.now() - 3600_000).toISOString());
  const { error } = await admin
    .from("google_agenda_estados")
    .insert({ estado, user_id: userId, voltar_para: voltarPara });
  if (error) throw new Error(error.message);
  return urlDeAutorizacao({
    clientId: cfg.clientId,
    redirectUri: cfg.redirectUri,
    estado,
    emailSugerido: email,
  });
}

/** Volta do Google: troca o código, guarda o refresh_token e devolve para onde ir. */
export async function concluirAutorizacao(admin: Admin, code: string, estado: string) {
  const cfg = configGoogle();
  if (!cfg.pronto) throw new Error("Integração com o Google não configurada");
  const { data: st } = await admin
    .from("google_agenda_estados")
    .select("user_id, voltar_para, criado_em")
    .eq("estado", estado)
    .maybeSingle();
  const s = st as { user_id: string; voltar_para: string | null; criado_em: string } | null;
  if (!s || Date.now() - Date.parse(s.criado_em) > 3600_000)
    throw new Error("O pedido de conexão expirou. Tente de novo pelo Compass.");
  await admin.from("google_agenda_estados").delete().eq("estado", estado);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId!,
      client_secret: cfg.clientSecret!,
      redirect_uri: cfg.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const tok = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    id_token?: string;
    error_description?: string;
  };
  if (!res.ok || !tok.access_token)
    throw new Error(tok.error_description || `Google respondeu ${res.status}`);

  const { data: atual } = await admin
    .from("google_agenda_contas")
    .select("refresh_token")
    .eq("user_id", s.user_id)
    .maybeSingle();
  const refresh = tok.refresh_token || (atual as { refresh_token?: string } | null)?.refresh_token;
  if (!refresh)
    throw new Error("O Google não devolveu a permissão permanente. Desconecte e conecte de novo.");

  let email: string | null = null;
  try {
    const u = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    });
    email = ((await u.json()) as { email?: string }).email ?? null;
  } catch {
    /* sem e-mail, segue */
  }
  const { error } = await admin.from("google_agenda_contas").upsert({
    user_id: s.user_id,
    email,
    refresh_token: refresh,
    access_token: tok.access_token,
    expira_em: new Date(Date.now() + (tok.expires_in ?? 3600) * 1000 - 60_000).toISOString(),
    escopo: tok.scope ?? null,
    conectado_em: new Date().toISOString(),
    ultimo_erro: null,
  });
  if (error) throw new Error(error.message);
  return { voltarPara: s.voltar_para || "/cs-integracoes", email };
}

/** Access token válido da pessoa (renova pelo refresh_token), ou null se não conectou. */
async function acessoDe(admin: Admin, userId: string): Promise<string | null> {
  const { data } = await admin
    .from("google_agenda_contas")
    .select("refresh_token, access_token, expira_em")
    .eq("user_id", userId)
    .maybeSingle();
  const c = data as {
    refresh_token: string;
    access_token: string | null;
    expira_em: string | null;
  } | null;
  if (!c) return null;
  if (c.access_token && c.expira_em && Date.parse(c.expira_em) > Date.now()) return c.access_token;
  const cfg = configGoogle();
  if (!cfg.pronto) return null;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId!,
      client_secret: cfg.clientSecret!,
      refresh_token: c.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const tok = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !tok.access_token) {
    await admin
      .from("google_agenda_contas")
      .update({
        ultimo_erro:
          tok.error === "invalid_grant"
            ? "A permissão do Google foi revogada ou expirou. Conecte de novo."
            : (tok.error_description ?? `Google respondeu ${res.status}`),
      })
      .eq("user_id", userId);
    return null;
  }
  await admin
    .from("google_agenda_contas")
    .update({
      access_token: tok.access_token,
      expira_em: new Date(Date.now() + (tok.expires_in ?? 3600) * 1000 - 60_000).toISOString(),
      ultimo_erro: null,
    })
    .eq("user_id", userId);
  return tok.access_token;
}

export async function googleConectado(admin: Admin, userId: string) {
  const { data } = await admin
    .from("google_agenda_contas")
    .select("email, conectado_em, ultimo_erro")
    .eq("user_id", userId)
    .maybeSingle();
  return data as { email: string | null; conectado_em: string; ultimo_erro: string | null } | null;
}

export async function desconectarGoogle(admin: Admin, userId: string) {
  const { data } = await admin
    .from("google_agenda_contas")
    .select("refresh_token")
    .eq("user_id", userId)
    .maybeSingle();
  const rt = (data as { refresh_token?: string } | null)?.refresh_token;
  if (rt)
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(rt)}`, {
      method: "POST",
    }).catch(() => undefined);
  await admin.from("google_agenda_contas").delete().eq("user_id", userId);
}

/**
 * Cria ou atualiza o evento na agenda da pessoa. O Google manda o convite aos
 * convidados (sendUpdates=all). Devolve o id do evento e o link do Meet.
 */
export async function salvarEventoNoGoogle(
  admin: Admin,
  userId: string,
  e: EventoCompass,
  eventoId: string | null,
): Promise<{ id: string; meet: string | null } | null> {
  const token = await acessoDe(admin, userId);
  if (!token) return null;
  const corpo = corpoDoEvento(e, !eventoId);
  const url = eventoId
    ? `${API}/${encodeURIComponent(eventoId)}?sendUpdates=all&conferenceDataVersion=1`
    : `${API}?sendUpdates=all&conferenceDataVersion=1`;
  const res = await fetch(url, {
    method: eventoId ? "PATCH" : "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const json = (await res.json()) as {
    id?: string;
    hangoutLink?: string;
    error?: { message?: string };
  };
  if (!res.ok || !json.id) {
    // Evento apagado no Google: cria de novo.
    if (eventoId && (res.status === 404 || res.status === 410))
      return salvarEventoNoGoogle(admin, userId, e, null);
    await admin
      .from("google_agenda_contas")
      .update({ ultimo_erro: json.error?.message ?? `Google respondeu ${res.status}` })
      .eq("user_id", userId);
    throw new Error(json.error?.message ?? `Google respondeu ${res.status}`);
  }
  return { id: json.id, meet: json.hangoutLink ?? null };
}

/** Cancela o evento (avisa os convidados). */
export async function cancelarEventoNoGoogle(admin: Admin, userId: string, eventoId: string) {
  const token = await acessoDe(admin, userId);
  if (!token) return false;
  const res = await fetch(`${API}/${encodeURIComponent(eventoId)}?sendUpdates=all`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.ok || res.status === 404 || res.status === 410;
}
