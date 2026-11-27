import type { SupabaseClient } from "@supabase/supabase-js";

/*
 * Reunião do CS → evento na Google Agenda de quem é dono dela (se a pessoa
 * conectou o Google). Agendada cria/atualiza; cancelada cancela; as outras
 * (realizada, no-show, reservada) ficam como estão. Nunca derruba a ação de
 * quem salvou a reunião: falha vira aviso no registro da conta Google.
 */
export type ResultadoGoogle = "criado" | "atualizado" | "cancelado" | "sem_conexao" | "nada";

export async function sincronizarReuniaoCsNoGoogle(
  admin: SupabaseClient,
  meetingId: string,
): Promise<ResultadoGoogle> {
  const { configGoogle } = await import("@/lib/google/agenda.server");
  if (!configGoogle().pronto) return "sem_conexao";
  const { data } = await admin
    .from("cs_meetings")
    .select(
      "id, title, status, occurred_at, duration_minutes, meeting_url, summary, owner_user_id, google_event_id, google_event_dono, cs_clients:client_uid(nome_empresa), cs_contacts:contact_id(nome, email)",
    )
    .eq("id", meetingId)
    .maybeSingle();
  const m = data as {
    id: string;
    title: string;
    status: string | null;
    occurred_at: string;
    duration_minutes: number | null;
    meeting_url: string | null;
    summary: string | null;
    owner_user_id: string | null;
    google_event_id: string | null;
    google_event_dono: string | null;
    cs_clients: { nome_empresa: string | null } | null;
    cs_contacts: { nome: string | null; email: string | null } | null;
  } | null;
  if (!m) return "nada";
  const dono = m.google_event_dono ?? m.owner_user_id;
  if (!dono) return "nada";
  const g = await import("@/lib/google/agenda.server");

  if (m.status === "cancelada") {
    if (!m.google_event_id) return "nada";
    const ok = await g.cancelarEventoNoGoogle(admin, dono, m.google_event_id);
    if (ok) await admin.from("cs_meetings").update({ google_event_id: null }).eq("id", m.id);
    return ok ? "cancelado" : "sem_conexao";
  }
  if (m.status !== "agendada") return "nada";

  const empresa = m.cs_clients?.nome_empresa ?? null;
  const r = await g.salvarEventoNoGoogle(
    admin,
    dono,
    {
      id: m.id,
      titulo: empresa ? `${m.title} · Grou × ${empresa}` : m.title,
      inicio: new Date(m.occurred_at),
      duracaoMin: m.duration_minutes ?? 60,
      descricao: m.summary,
      link: m.meeting_url,
      convidados: m.cs_contacts?.email
        ? [{ email: m.cs_contacts.email, nome: m.cs_contacts.nome }]
        : [],
    },
    m.google_event_id,
  );
  if (!r) return "sem_conexao";
  await admin
    .from("cs_meetings")
    .update({
      google_event_id: r.id,
      google_event_dono: dono,
      // Sem link na reunião, o Meet que o Google criou passa a ser o link.
      ...(!m.meeting_url && r.meet ? { meeting_url: r.meet } : {}),
    })
    .eq("id", m.id);
  return m.google_event_id ? "atualizado" : "criado";
}

/** Antes de apagar a reunião: cancela o evento no Google, se houver. */
export async function cancelarNoGoogleAntesDeApagar(admin: SupabaseClient, meetingId: string) {
  const { data } = await admin
    .from("cs_meetings")
    .select("google_event_id, google_event_dono, owner_user_id")
    .eq("id", meetingId)
    .maybeSingle();
  const m = data as {
    google_event_id: string | null;
    google_event_dono: string | null;
    owner_user_id: string | null;
  } | null;
  const dono = m?.google_event_dono ?? m?.owner_user_id;
  if (!m?.google_event_id || !dono) return;
  const g = await import("@/lib/google/agenda.server");
  await g.cancelarEventoNoGoogle(admin, dono, m.google_event_id).catch(() => false);
}

/** Roda a sincronização sem nunca quebrar quem chamou. */
export async function sincronizarSemFalhar(meetingId: string): Promise<ResultadoGoogle> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return await sincronizarReuniaoCsNoGoogle(
      supabaseAdmin as unknown as SupabaseClient,
      meetingId,
    );
  } catch (e) {
    console.warn("[google] reunião", meetingId, e);
    return "nada";
  }
}
