/*
 * Convite de reunião SDR → executivo (lado servidor).
 *
 *  1. Disponibilidade: a Google Agenda do executivo é sincronizada (o mesmo
 *     endereço iCal que o CS usa) e os eventos viram "ocupado"; somam-se as
 *     outras reuniões marcadas com ele no CRM.
 *  2. Convite: e-mail com o .ics (METHOD:REQUEST) para lead + executivo + SDR.
 *     Quem aceita ganha o evento na própria agenda.
 *  3. Briefing: e-mail só para o executivo (cópia ao SDR) com a reunião, a
 *     empresa, o lead e a passada de bastão — BANT, observações e resumo da
 *     conversa de WhatsApp (IA, quando houver conversa).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { LeadBant } from "@/lib/sdr-playbook";
import {
  buildIcs,
  conflictsFor,
  dayKey,
  DEFAULT_MEETING_SETTINGS,
  freeSlots,
  googleCalendarLink,
  humanWhen,
  type Interval,
  type MeetingSettings,
} from "@/lib/sdr/meeting-invite";

const APP_URL = process.env.APP_PUBLIC_URL || "https://compass.groupp.com";
const SETTINGS_KEY = "sdr_meeting";
const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const AI_MODEL = "google/gemini-2.5-flash";

export async function getMeetingSettings(): Promise<MeetingSettings> {
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();
  const raw = (data?.value ?? {}) as Partial<MeetingSettings>;
  return {
    ...DEFAULT_MEETING_SETTINGS,
    ...raw,
    hours: { ...DEFAULT_MEETING_SETTINGS.hours, ...(raw.hours ?? {}) },
  };
}

// ---------------------------------------------------------------------------
// Pessoas
// ---------------------------------------------------------------------------
type Person = { id: string; name: string; email: string | null; meetingUrl: string | null };

async function loadPerson(userId: string | null): Promise<Person | null> {
  if (!userId) return null;
  const [{ data: p }, { data: integ }] = await Promise.all([
    supabaseAdmin.from("profiles").select("id, full_name, email").eq("id", userId).maybeSingle(),
    supabaseAdmin
      .from("cs_user_integrations")
      .select("meeting_url, email_address")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (!p) return null;
  return {
    id: p.id,
    name: p.full_name || p.email || "Grou",
    email: (integ as { email_address?: string | null } | null)?.email_address || p.email || null,
    meetingUrl: (integ as { meeting_url?: string | null } | null)?.meeting_url ?? null,
  };
}

// ---------------------------------------------------------------------------
// Disponibilidade do executivo
// ---------------------------------------------------------------------------
export async function executivoAvailability(opts: {
  executivoId: string;
  day: string; // yyyy-mm-dd
  durationMin?: number;
  excludeLeadId?: string | null;
  meetingAt?: Date | null;
}) {
  const settings = await getMeetingSettings();
  const durationMin = opts.durationMin ?? settings.duration_min;
  const { data: integ } = await supabaseAdmin
    .from("cs_user_integrations")
    .select("gcal_ics_url, gcal_last_sync_at, gcal_last_error")
    .eq("user_id", opts.executivoId)
    .maybeSingle();
  const connected = !!integ?.gcal_ics_url;

  // agenda velha há mais de 10 min: sincroniza só essa pessoa antes de olhar
  if (connected) {
    const last = integ?.gcal_last_sync_at ? new Date(integ.gcal_last_sync_at).getTime() : 0;
    if (Date.now() - last > 10 * 60000) {
      const { syncGoogleCalendars } = await import("@/lib/cs/integrations.server");
      await syncGoogleCalendars([opts.executivoId], 45, 1).catch(() => null);
    }
  }

  const dayStart = new Date(`${opts.day}T00:00:00-03:00`);
  const dayEnd = new Date(dayStart.getTime() + 36 * 3600000);
  const [{ data: events }, { data: others }] = await Promise.all([
    connected
      ? supabaseAdmin
          .from("cs_calendly_events")
          .select("name, start_time, end_time, status")
          .eq("user_id", opts.executivoId)
          .neq("status", "canceled")
          .lt("start_time", dayEnd.toISOString())
          .gt("end_time", dayStart.toISOString())
      : Promise.resolve({
          data: [] as Array<{
            name: string | null;
            start_time: string;
            end_time: string | null;
            status: string | null;
          }>,
        }),
    supabaseAdmin
      .from("leads")
      .select("id, company_name, meeting_at, meeting_duration_min")
      .eq("executivo_id", opts.executivoId)
      .gte("meeting_at", dayStart.toISOString())
      .lt("meeting_at", dayEnd.toISOString()),
  ]);

  const busy: Interval[] = [];
  for (const e of events ?? []) {
    const start = new Date(e.start_time);
    const end = e.end_time ? new Date(e.end_time) : new Date(start.getTime() + 3600000);
    busy.push({ start, end, title: e.name ?? "Compromisso" });
  }
  for (const l of others ?? []) {
    if (!l.meeting_at || l.id === opts.excludeLeadId) continue;
    const start = new Date(l.meeting_at);
    busy.push({
      start,
      end: new Date(start.getTime() + (l.meeting_duration_min ?? settings.duration_min) * 60000),
      title: `Reunião CRM: ${l.company_name ?? "lead"}`,
    });
  }
  busy.sort((a, b) => a.start.getTime() - b.start.getTime());

  const conflicts = opts.meetingAt ? conflictsFor(opts.meetingAt, durationMin, busy) : [];
  const free = freeSlots({ day: opts.day, busy, durationMin, settings, max: 8 });
  return {
    connected,
    lastSyncAt: integ?.gcal_last_sync_at ?? null,
    error: integ?.gcal_last_error ?? null,
    durationMin,
    busy: busy.map((b) => ({
      start: b.start.toISOString(),
      end: b.end.toISOString(),
      title: b.title ?? null,
    })),
    conflicts: conflicts.map((b) => ({
      start: b.start.toISOString(),
      end: b.end.toISOString(),
      title: b.title ?? null,
    })),
    free: free.map((d) => d.toISOString()),
  };
}

// ---------------------------------------------------------------------------
// Passada de bastão
// ---------------------------------------------------------------------------
type LeadRow = Record<string, unknown> & {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  position: string | null;
  bant: LeadBant | null;
  meeting_at: string | null;
  meeting_duration_min: number | null;
  meeting_invite_uid: string | null;
  meeting_invite_sequence: number | null;
  meeting_invite_sent_at: string | null;
  meeting_handoff: string | null;
  executivo_id: string | null;
  assigned_to: string | null;
};

const BANT_LABEL: Record<string, string> = {
  budget: "Budget (orçamento)",
  authority: "Authority (decisor)",
  need: "Need (necessidade)",
  timeline: "Timeline (prazo)",
};
const BANT_STATUS: Record<string, string> = {
  ok: "✅ validado",
  parcial: "🟡 parcial",
  bloqueio: "❌ bloqueio",
  nao_avaliado: "— não avaliado",
};

export type Handoff = {
  bant: Array<{ key: string; label: string; status: string; notes: string }>;
  bantSummary: string | null;
  notes: Array<{ at: string; content: string }>;
  conversationSummary: string | null;
  form: Array<{ key: string; value: string }> | null;
  suggested: string;
};

async function callAI(prompt: string): Promise<string | null> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(AI_GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          {
            role: "system",
            content:
              "Você é SDR da Grou (gestão de pessoas e desenvolvimento de lideranças) e está passando o bastão de um lead para o executivo comercial que fará a reunião. Escreva em português do Brasil, direto, sem inventar fatos.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return json.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

/** Monta o contexto do lead para o executivo (BANT, observações, conversa). */
export async function buildHandoff(lead: LeadRow): Promise<Handoff> {
  const [{ data: notes }, { data: conv }] = await Promise.all([
    supabaseAdmin
      .from("lead_notes")
      .select("content, created_at")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false })
      .limit(6),
    supabaseAdmin
      .from("whatsapp_conversations")
      .select("id, ai_summary, ai_summary_at")
      .eq("lead_id", lead.id)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const bant = (lead.bant ?? {}) as LeadBant;
  const bantRows = (["budget", "authority", "need", "timeline"] as const).map((k) => {
    const v = bant[k];
    return {
      key: k,
      label: BANT_LABEL[k],
      status: BANT_STATUS[v?.status ?? "nao_avaliado"] ?? BANT_STATUS.nao_avaliado,
      notes: v?.notes?.trim() ?? "",
    };
  });

  // resumo da conversa: reaproveita o da caixa de entrada ou pede um novo
  let conversationSummary: string | null = conv?.ai_summary ?? null;
  if (conv?.id && !conversationSummary) {
    const { data: msgs } = await supabaseAdmin
      .from("whatsapp_messages")
      .select("sender_type, body, created_at")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: false })
      .limit(60);
    const list = (msgs ?? []).reverse().filter((m) => m.body);
    if (list.length) {
      const transcript = list
        .map(
          (m) => `${m.sender_type === "lead" ? "Lead" : "Grou"}: ${String(m.body).slice(0, 400)}`,
        )
        .join("\n");
      conversationSummary = await callAI(
        `Resuma a conversa abaixo em até 6 bullets (1 linha cada): contexto do lead, dor, objeções, sinais de compra, o que foi combinado. Lead: ${lead.name ?? ""} — ${lead.company_name ?? ""}.\n\n${transcript}`,
      );
    }
  }

  const form =
    lead.form_payload && typeof lead.form_payload === "object"
      ? Object.entries(lead.form_payload as Record<string, unknown>)
          .filter(([, v]) => v !== null && v !== "" && typeof v !== "object")
          .slice(0, 30)
          .map(([key, v]) => ({ key, value: String(v) }))
      : null;

  const suggested = [
    bant.summary?.trim() ? `Resumo BANT: ${bant.summary.trim()}` : "",
    ...bantRows.filter((b) => b.notes).map((b) => `${b.label}: ${b.notes}`),
    conversationSummary ? `\nConversa:\n${conversationSummary}` : "",
    (notes ?? []).length
      ? `\nObservações do SDR:\n${(notes ?? []).map((n) => `- ${n.content}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    bant: bantRows,
    bantSummary: bant.summary?.trim() || null,
    notes: (notes ?? []).map((n) => ({ at: n.created_at, content: n.content })),
    conversationSummary,
    form,
    suggested: suggested || "Sem contexto registrado ainda — complete a passada de bastão.",
  };
}

// ---------------------------------------------------------------------------
// E-mail (Resend)
// ---------------------------------------------------------------------------
type Attachment = { filename: string; content: string; content_type?: string };

async function sendEmail(input: {
  from: string;
  to: string[];
  cc?: string[];
  replyTo?: string | null;
  subject: string;
  html: string;
  text: string;
  attachments?: Attachment[];
}): Promise<string | null> {
  const key = process.env.RESEND_API_KEY;
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY não configurada");
  if (!lovableKey) throw new Error("LOVABLE_API_KEY não configurada");
  const res = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: input.from,
      to: input.to,
      ...(input.cc?.length ? { cc: input.cc } : {}),
      ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      subject: input.subject,
      html: input.html,
      text: input.text,
      ...(input.attachments?.length ? { attachments: input.attachments } : {}),
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Resend ${res.status}: ${body.slice(0, 200)}`);
  try {
    return (JSON.parse(body) as { id?: string }).id ?? null;
  } catch {
    return null;
  }
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const nl2br = (s: string) => esc(s).replace(/\n/g, "<br/>");

function shell(title: string, body: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f5f6f8;padding:24px;">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
    <div style="background:#111827;color:#fff;padding:14px 24px;font-weight:700;font-size:15px;">${esc(title)}</div>
    <div style="padding:24px;color:#111827;font-size:14px;line-height:1.55;">${body}</div>
    <div style="padding:12px 24px;border-top:1px solid #e5e7eb;color:#9ca3af;font-size:11px;">Grou Compass CRM</div>
  </div></div>`;
}

// ---------------------------------------------------------------------------
// Envio do convite + briefing
// ---------------------------------------------------------------------------
export async function sendMeetingInvite(opts: {
  leadId: string;
  sdrId: string;
  handoff?: string | null;
  durationMin?: number | null;
  leadEmail?: string | null;
}) {
  const settings = await getMeetingSettings();
  const { data: leadRaw, error } = await supabaseAdmin
    .from("leads")
    .select("*")
    .eq("id", opts.leadId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!leadRaw) throw new Error("Lead não encontrado");
  const lead = leadRaw as unknown as LeadRow;
  if (!lead.meeting_at) throw new Error("Defina a data da reunião antes de enviar o convite");
  if (!lead.executivo_id) throw new Error("Escolha o executivo que fará a reunião");

  const leadEmail = (opts.leadEmail ?? lead.email ?? "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(leadEmail)) throw new Error("O lead precisa de um e-mail válido");

  const [executivo, sdr] = await Promise.all([
    loadPerson(lead.executivo_id),
    loadPerson(opts.sdrId),
  ]);
  if (!executivo?.email) throw new Error("O executivo não tem e-mail cadastrado");

  const start = new Date(lead.meeting_at);
  const durationMin = opts.durationMin ?? lead.meeting_duration_min ?? settings.duration_min;
  const end = new Date(start.getTime() + durationMin * 60000);
  const uid = lead.meeting_invite_uid ?? `lead-${lead.id}@compass.groupp.com`;
  const sequence = lead.meeting_invite_uid ? (lead.meeting_invite_sequence ?? 0) + 1 : 0;
  const isUpdate = sequence > 0;
  const company = lead.company_name ?? "sua empresa";
  const leadName = lead.name ?? leadEmail;
  const when = humanWhen(start, settings.tz);
  const meetingUrl = executivo.meetingUrl;
  const location = meetingUrl ?? "Videochamada — o link será enviado pelo executivo";

  // ---- 1. Convite (lead + executivo + SDR) ----
  const summary = `Grou × ${company} — reunião com ${executivo.name}`;
  const description = [
    `Reunião entre ${company} (${leadName}) e ${executivo.name}, executivo(a) da Grou.`,
    `Marcada por ${sdr?.name ?? "SDR Grou"}.`,
    meetingUrl ? `Link da reunião: ${meetingUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const ics = buildIcs({
    uid,
    sequence,
    method: "REQUEST",
    start,
    durationMin,
    summary,
    description,
    location,
    url: meetingUrl,
    organizer: { email: settings.from_email, name: sdr?.name ?? "Grou" },
    attendees: [
      { email: leadEmail, name: leadName },
      { email: executivo.email, name: executivo.name },
      ...(sdr?.email
        ? [{ email: sdr.email, name: sdr.name, role: "OPT-PARTICIPANT" as const }]
        : []),
    ],
  });
  // O reconhecimento automático do .ics varia muito entre Gmail/Outlook/apps —
  // este link sempre funciona para quem tem conta Google: abre o evento já
  // preenchido, com o outro lado como convidado, e a pessoa só confirma.
  const addToCalendarUrl = googleCalendarLink({
    title: summary,
    start,
    end,
    details: `Reunião entre ${company} e ${executivo.name}, da Grou.${meetingUrl ? ` Link: ${meetingUrl}` : ""}`,
    location,
    guests: [leadEmail, executivo.email],
  });
  const inviteText = [
    `Olá, ${leadName}!`,
    "",
    `${isUpdate ? "Atualizamos a sua reunião" : "Sua reunião"} com ${executivo.name}, da Grou, ${isUpdate ? "para" : "está marcada para"} ${when} (${durationMin} min).`,
    meetingUrl
      ? `Link: ${meetingUrl}`
      : "O link da videochamada será enviado pelo(a) ${executivo.name}.",
    "",
    "Adicione à sua agenda:",
    addToCalendarUrl,
    "",
    "O convite também está anexo (arquivo .ics) — dependendo do seu app de e-mail, aceitar por ele também funciona.",
    "",
    `${sdr?.name ?? "Equipe Grou"} · Grou`,
  ].join("\n");
  const inviteHtml = shell(
    isUpdate ? "Reunião atualizada" : "Reunião marcada",
    `<p>Olá, <strong>${esc(leadName)}</strong>!</p>
     <p>${isUpdate ? "Atualizamos a sua reunião" : "Sua reunião"} com <strong>${esc(executivo.name)}</strong>, da Grou, ${isUpdate ? "para" : "está marcada para"} <strong>${esc(when)}</strong> (${durationMin} min).</p>
     <p>
       <a href="${esc(addToCalendarUrl)}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;">Adicionar à Google Agenda</a>
       ${meetingUrl ? `&nbsp; <a href="${esc(meetingUrl)}" style="color:#111827;font-weight:600;">Entrar na reunião →</a>` : ""}
     </p>
     <p style="color:#6b7280">O convite também está anexo (arquivo .ics) — dependendo do seu app de e-mail, aceitar por ele também funciona.</p>
     <p>${esc(sdr?.name ?? "Equipe Grou")} · Grou</p>`,
  );
  const from = `${sdr?.name ?? "Grou"} · Grou <${settings.from_email}>`;
  const inviteId = await sendEmail({
    from,
    to: [leadEmail, executivo.email],
    cc: sdr?.email ? [sdr.email] : [],
    replyTo: sdr?.email ?? null,
    subject: `${isUpdate ? "Atualização: " : ""}Reunião Grou × ${company} — ${when}`,
    html: inviteHtml,
    text: inviteText,
    attachments: [
      {
        filename: "convite.ics",
        content: Buffer.from(ics, "utf8").toString("base64"),
        content_type: "text/calendar; method=REQUEST; charset=UTF-8",
      },
    ],
  });

  // ---- 2. Briefing para o executivo ----
  const handoff = await buildHandoff(lead);
  const handoffText = (opts.handoff ?? lead.meeting_handoff ?? handoff.suggested).trim();
  const leadUrl = `${APP_URL}/lead/${lead.id}`;
  const bantHtml = handoff.bant
    .map(
      (b) =>
        `<tr><td style="padding:6px 8px;border-bottom:1px solid #f3f4f6;white-space:nowrap"><strong>${esc(b.label)}</strong></td><td style="padding:6px 8px;border-bottom:1px solid #f3f4f6">${esc(b.status)}${b.notes ? ` — ${esc(b.notes)}` : ""}</td></tr>`,
    )
    .join("");
  const formHtml = handoff.form?.length
    ? `<details style="margin-top:12px"><summary style="cursor:pointer;color:#6b7280">Respostas do formulário</summary><table style="border-collapse:collapse;font-size:12px;margin-top:6px">${handoff.form
        .map(
          (f) =>
            `<tr><td style="padding:3px 8px;color:#6b7280">${esc(f.key)}</td><td style="padding:3px 8px">${esc(f.value)}</td></tr>`,
        )
        .join("")}</table></details>`
    : "";
  const execAddToCalendarUrl = googleCalendarLink({
    title: summary,
    start,
    end,
    details: `Reunião com ${leadName}${lead.position ? `, ${lead.position}` : ""} (${company}).${meetingUrl ? ` Link: ${meetingUrl}` : ""} Passada de bastão e detalhes: ${leadUrl}`,
    location,
    guests: [leadEmail, executivo.email],
  });
  const briefingHtml = shell(
    `Reunião ${when} — ${company}`,
    `<p>Oi, ${esc(executivo.name.split(" ")[0])}! ${esc(sdr?.name ?? "O SDR")} marcou uma reunião para você:</p>
     <table style="border-collapse:collapse;margin:8px 0 16px 0">
       <tr><td style="padding:4px 8px;color:#6b7280">Quando</td><td style="padding:4px 8px"><strong>${esc(when)}</strong> · ${durationMin} min</td></tr>
       <tr><td style="padding:4px 8px;color:#6b7280">Empresa</td><td style="padding:4px 8px"><strong>${esc(company)}</strong>${lead.company_segment ? ` · ${esc(String(lead.company_segment))}` : ""}${lead.linkedin_company_size || lead.company_size ? ` · ${esc(String(lead.linkedin_company_size ?? lead.company_size))}` : ""}</td></tr>
       <tr><td style="padding:4px 8px;color:#6b7280">Lead</td><td style="padding:4px 8px">${esc(leadName)}${lead.position ? `, ${esc(String(lead.position))}` : ""}<br/><span style="color:#6b7280">${esc(leadEmail)}${lead.phone ? ` · ${esc(String(lead.phone))}` : ""}</span></td></tr>
       ${meetingUrl ? `<tr><td style="padding:4px 8px;color:#6b7280">Link</td><td style="padding:4px 8px"><a href="${esc(meetingUrl)}">${esc(meetingUrl)}</a></td></tr>` : ""}
       ${lead.source || lead.campaign ? `<tr><td style="padding:4px 8px;color:#6b7280">Origem</td><td style="padding:4px 8px">${esc([lead.source, lead.campaign, lead.form_name].filter(Boolean).join(" · "))}</td></tr>` : ""}
     </table>
     <p><a href="${esc(execAddToCalendarUrl)}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;">Adicionar à Google Agenda</a></p>
     <h3 style="margin:16px 0 6px 0;font-size:14px">Passada de bastão</h3>
     <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px">${nl2br(handoffText)}</div>
     <h3 style="margin:16px 0 6px 0;font-size:14px">Qualificação BANT</h3>
     <table style="border-collapse:collapse;width:100%;font-size:13px">${bantHtml}</table>
     ${handoff.bantSummary ? `<p style="color:#374151;margin-top:8px">${nl2br(handoff.bantSummary)}</p>` : ""}
     ${formHtml}
     <p style="margin-top:20px"><a href="${leadUrl}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;">Abrir o lead no Compass</a></p>`,
  );
  const briefingText = [
    `Reunião ${when} (${durationMin} min) — ${company}`,
    `Lead: ${leadName}${lead.position ? `, ${lead.position}` : ""} · ${leadEmail}${lead.phone ? ` · ${lead.phone}` : ""}`,
    meetingUrl ? `Link: ${meetingUrl}` : "",
    "",
    "Adicionar à sua agenda:",
    execAddToCalendarUrl,
    "",
    "PASSADA DE BASTÃO",
    handoffText,
    "",
    "BANT",
    ...handoff.bant.map((b) => `${b.label}: ${b.status}${b.notes ? ` — ${b.notes}` : ""}`),
    "",
    `Lead no Compass: ${leadUrl}`,
  ]
    .filter((l) => l !== undefined)
    .join("\n");

  let briefingId: string | null = null;
  let briefingError: string | null = null;
  try {
    briefingId = await sendEmail({
      from,
      to: [executivo.email],
      cc: sdr?.email ? [sdr.email] : [],
      replyTo: sdr?.email ?? null,
      subject: `${isUpdate ? "Atualização · " : ""}Reunião ${when} — ${company} (${leadName})`,
      html: briefingHtml,
      text: briefingText,
    });
  } catch (e) {
    briefingError = e instanceof Error ? e.message : String(e);
  }

  // ---- 3. Registro ----
  const now = new Date().toISOString();
  await supabaseAdmin
    .from("leads")
    .update({
      email: lead.email ?? leadEmail,
      meeting_invite_uid: uid,
      meeting_invite_sequence: sequence,
      meeting_invite_sent_at: now,
      meeting_duration_min: durationMin,
      meeting_handoff: handoffText,
    } as never)
    .eq("id", lead.id);
  await supabaseAdmin.from("lead_meeting_invites").insert({
    lead_id: lead.id,
    uid,
    sequence,
    method: "REQUEST",
    meeting_at: start.toISOString(),
    duration_min: durationMin,
    executivo_id: executivo.id,
    sdr_id: opts.sdrId,
    to_emails: [leadEmail, executivo.email, ...(sdr?.email ? [sdr.email] : [])],
    handoff: handoffText,
    invite_message_id: inviteId,
    briefing_message_id: briefingId,
    briefing_sent_at: briefingId ? now : null,
    error: briefingError,
  } as never);
  await supabaseAdmin.from("lead_interactions").insert({
    lead_id: lead.id,
    author_id: opts.sdrId,
    type: "meeting_invite",
    content: `${isUpdate ? "Convite atualizado" : "Convite enviado"} para ${leadEmail} e ${executivo.email} — reunião ${when} com ${executivo.name}`,
    metadata: { uid, sequence, briefing: !!briefingId } as never,
  } as never);

  return { ok: true, isUpdate, sentAt: now, briefingSent: !!briefingId, briefingError, when };
}

/** Cancela o convite (METHOD:CANCEL) — quando a reunião cai. */
export async function cancelMeetingInvite(opts: {
  leadId: string;
  sdrId: string;
  reason?: string;
}) {
  const settings = await getMeetingSettings();
  const { data: leadRaw } = await supabaseAdmin
    .from("leads")
    .select("*")
    .eq("id", opts.leadId)
    .maybeSingle();
  const lead = leadRaw as unknown as LeadRow | null;
  if (!lead?.meeting_invite_uid || !lead.meeting_at)
    throw new Error("Este lead não tem convite enviado");
  const [executivo, sdr] = await Promise.all([
    loadPerson(lead.executivo_id),
    loadPerson(opts.sdrId),
  ]);
  const start = new Date(lead.meeting_at);
  const sequence = (lead.meeting_invite_sequence ?? 0) + 1;
  const to = [lead.email, executivo?.email].filter((e): e is string => !!e);
  const ics = buildIcs({
    uid: lead.meeting_invite_uid,
    sequence,
    method: "CANCEL",
    start,
    durationMin: lead.meeting_duration_min ?? settings.duration_min,
    summary: `Grou × ${lead.company_name ?? ""} — reunião com ${executivo?.name ?? "Grou"}`,
    organizer: { email: settings.from_email, name: sdr?.name ?? "Grou" },
    attendees: to.map((email) => ({ email })),
  });
  const when = humanWhen(start, settings.tz);
  // O cancelamento remove sozinho quando a pessoa aceitou pelo anexo original;
  // quem adicionou pelo link "Adicionar à Google Agenda" criou um evento à
  // parte, então avisamos para remover na mão se ele não sumir sozinho.
  const manualNote =
    "Se a reunião não sumir sozinha da sua agenda, é só apagar o evento manualmente.";
  const text = `A reunião de ${when} entre Grou e ${lead.company_name ?? "sua empresa"} foi cancelada.${opts.reason ? `\nMotivo: ${opts.reason}` : ""}\n\n${manualNote}\n\n${sdr?.name ?? "Equipe Grou"} · Grou`;
  const id = await sendEmail({
    from: `${sdr?.name ?? "Grou"} · Grou <${settings.from_email}>`,
    to,
    cc: sdr?.email ? [sdr.email] : [],
    replyTo: sdr?.email ?? null,
    subject: `Cancelada: reunião Grou × ${lead.company_name ?? ""} — ${when}`,
    html: shell(
      "Reunião cancelada",
      `<p>${nl2br(`A reunião de ${when} entre Grou e ${lead.company_name ?? "sua empresa"} foi cancelada.${opts.reason ? `\nMotivo: ${opts.reason}` : ""}`)}</p><p style="color:#6b7280">${manualNote}</p>`,
    ),
    text,
    attachments: [
      {
        filename: "cancelamento.ics",
        content: Buffer.from(ics, "utf8").toString("base64"),
        content_type: "text/calendar; method=CANCEL; charset=UTF-8",
      },
    ],
  });
  const now = new Date().toISOString();
  await supabaseAdmin
    .from("leads")
    .update({ meeting_invite_sequence: sequence, meeting_invite_sent_at: null } as never)
    .eq("id", lead.id);
  await supabaseAdmin.from("lead_meeting_invites").insert({
    lead_id: lead.id,
    uid: lead.meeting_invite_uid,
    sequence,
    method: "CANCEL",
    meeting_at: start.toISOString(),
    duration_min: lead.meeting_duration_min ?? settings.duration_min,
    executivo_id: executivo?.id ?? null,
    sdr_id: opts.sdrId,
    to_emails: to,
    invite_message_id: id,
  } as never);
  await supabaseAdmin.from("lead_interactions").insert({
    lead_id: lead.id,
    author_id: opts.sdrId,
    type: "meeting_invite",
    content: `Convite cancelado — reunião ${when}`,
    metadata: { uid: lead.meeting_invite_uid, sequence, cancel: true } as never,
  } as never);
  return { ok: true, sentAt: now };
}

export { dayKey };
