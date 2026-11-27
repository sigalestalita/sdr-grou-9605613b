import type { SupabaseClient } from "@supabase/supabase-js";
import { buildIcs, googleCalendarLink, humanWhen } from "@/lib/sdr/meeting-invite";

/*
 * Convite de calendário da reunião do CS (a que saiu de uma oferta de
 * horários): o mesmo formato do convite do SDR — .ics anexo (METHOD:REQUEST)
 * mais o botão "Adicionar à Google Agenda". Vai para o contato do cliente e
 * para quem ofereceu; no Gmail/Google Workspace o convite já entra sozinho na
 * agenda de quem recebe.
 */
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function enviarConviteDaReuniaoCs(
  admin: SupabaseClient,
  meetingId: string,
): Promise<{ enviado: boolean; para: string[]; paraContato?: boolean; motivo?: string }> {
  const { data: m } = await admin
    .from("cs_meetings")
    .select(
      "id, client_uid, title, occurred_at, duration_minutes, meeting_url, summary, owner_user_id, cs_clients:client_uid(nome_empresa), cs_contacts:contact_id(nome, email)",
    )
    .eq("id", meetingId)
    .maybeSingle();
  const r = m as {
    id: string;
    client_uid: string;
    title: string;
    occurred_at: string;
    duration_minutes: number | null;
    meeting_url: string | null;
    summary: string | null;
    owner_user_id: string | null;
    cs_clients: { nome_empresa: string | null } | null;
    cs_contacts: { nome: string | null; email: string | null } | null;
  } | null;
  if (!r) return { enviado: false, para: [], motivo: "reunião não encontrada" };

  const { data: dono } = r.owner_user_id
    ? await admin
        .from("profiles")
        .select("full_name, email")
        .eq("id", r.owner_user_id)
        .maybeSingle()
    : { data: null };
  const organizador = dono as { full_name: string | null; email: string | null } | null;
  const contatoEmail = r.cs_contacts?.email?.trim().toLowerCase() || null;
  const donoEmail = organizador?.email?.trim().toLowerCase() || null;
  const para = [...new Set([contatoEmail, donoEmail].filter((e): e is string => !!e))];
  if (!para.length) return { enviado: false, para: [], motivo: "sem e-mail de participante" };

  const { getMeetingSettings, sendEmail } = await import("@/lib/sdr/meeting-invite.server");
  const settings = await getMeetingSettings();
  const inicio = new Date(r.occurred_at);
  const duracao = r.duration_minutes ?? 60;
  const fim = new Date(inicio.getTime() + duracao * 60000);
  const empresa = r.cs_clients?.nome_empresa ?? "Cliente";
  const nomeDono = organizador?.full_name ?? "Grou";
  const quando = humanWhen(inicio, settings.tz);
  const descricao = [
    r.summary ? `Pauta: ${r.summary}` : null,
    r.meeting_url ? `Link: ${r.meeting_url}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const ics = buildIcs({
    uid: `cs-meeting-${r.id}@compass.grougp.com`,
    sequence: 0,
    method: "REQUEST",
    start: inicio,
    durationMin: duracao,
    summary: `${r.title} · Grou × ${empresa}`,
    description: descricao || undefined,
    location: r.meeting_url,
    url: r.meeting_url,
    organizer: { email: donoEmail ?? settings.from_email, name: nomeDono },
    attendees: para.map((email) => ({
      email,
      name: email === contatoEmail ? (r.cs_contacts?.nome ?? null) : nomeDono,
    })),
  });
  const addGoogle = googleCalendarLink({
    title: `${r.title} · Grou × ${empresa}`,
    start: inicio,
    end: fim,
    details: descricao || undefined,
    location: r.meeting_url,
    guests: para,
  });
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f5f6f8;padding:24px;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
    <div style="background:#111827;color:#fff;padding:14px 24px;font-weight:700;font-size:15px;">Reunião confirmada</div>
    <div style="padding:24px;color:#111827;font-size:14px;line-height:1.55;">
      <p><strong>${esc(r.title)}</strong> · Grou × ${esc(empresa)}</p>
      <p>${esc(quando)} (${duracao} min) — horário de Brasília.</p>
      ${r.summary ? `<p style="white-space:pre-wrap;color:#374151">${esc(r.summary)}</p>` : ""}
      <p>
        <a href="${esc(addGoogle)}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;">Adicionar à Google Agenda</a>
        ${r.meeting_url ? `&nbsp; <a href="${esc(r.meeting_url)}" style="color:#111827;font-weight:600;">Entrar na reunião →</a>` : ""}
      </p>
      <p style="color:#6b7280">O convite também está anexo (arquivo .ics): aceitar por ele coloca a reunião na sua agenda.</p>
      <p>${esc(nomeDono)} · Grou</p>
    </div>
    <div style="padding:12px 24px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:11px;">Grou Compass CRM</div>
  </div></div>`;
  const texto = `Reunião confirmada: ${r.title} · Grou × ${empresa}\n${quando} (${duracao} min), horário de Brasília.${r.meeting_url ? `\nLink: ${r.meeting_url}` : ""}\nAdicionar à Google Agenda: ${addGoogle}`;

  await sendEmail({
    from: `${nomeDono} · Grou <${settings.from_email}>`,
    to: para,
    replyTo: donoEmail,
    subject: `Reunião confirmada: ${r.title} — ${quando}`,
    html,
    text: texto,
    attachments: [
      {
        filename: "convite.ics",
        content: Buffer.from(ics, "utf8").toString("base64"),
        content_type: "text/calendar; method=REQUEST; charset=UTF-8",
      },
    ],
  });
  return { enviado: true, para, paraContato: !!contatoEmail };
}
