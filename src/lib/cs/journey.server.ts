import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { licenseStart } from "@/lib/cs/cadence";
import {
  DEFAULT_JOURNEY_CONFIG,
  journeyBodyToHtml,
  planJourney,
  renderJourneyBody,
  type JourneyConfig,
} from "@/lib/cs/journey";

/*
 * Jornadas Reais: agenda os marcos por empresa, escolhe o destinatário
 * (contato com e-mail — analista PDA primeiro), envia pela Resend e grava o
 * e-mail enviado em cs_emails (direction outbound) — assim aparece na
 * timeline e vale como evidência de e-mail.
 */

export async function getJourneyConfig(): Promise<JourneyConfig> {
  const { data } = await supabaseAdmin
    .from("cs_settings")
    .select("value")
    .eq("key", "journey_emails")
    .maybeSingle();
  return { ...DEFAULT_JOURNEY_CONFIG, ...((data?.value as object) ?? {}) } as JourneyConfig;
}

async function pickRecipient(clientUid: string) {
  const { data } = await supabaseAdmin
    .from("cs_contacts")
    .select("id, nome, email, analista_pda, ativo_no_cliente")
    .eq("client_uid", clientUid)
    .not("email", "is", null);
  const list = (data ?? []).filter((c) => c.email && c.ativo_no_cliente !== false);
  return list.find((c) => c.analista_pda) ?? list[0] ?? null;
}

/** Cria os registros que faltam (agendado/pendente/expirado) para todas as empresas ativas. */
export async function scheduleJourneyEmails(clientUid?: string) {
  const cfg = await getJourneyConfig();
  let q = supabaseAdmin
    .from("cs_clients")
    .select("client_uid, tag_uso, data_inicio_contrato, data_renovacao, tipo_lead")
    .eq("ativo", true);
  if (clientUid) q = q.eq("client_uid", clientUid);
  const [{ data: clients }, { data: existing }] = await Promise.all([
    q,
    clientUid
      ? supabaseAdmin
          .from("cs_journey_emails")
          .select("client_uid, email_id, status")
          .eq("client_uid", clientUid)
      : supabaseAdmin.from("cs_journey_emails").select("client_uid, email_id, status"),
  ]);
  const byClient = new Map<string, { email_id: string; status: string }[]>();
  for (const r of existing ?? [])
    byClient.set(r.client_uid, [...(byClient.get(r.client_uid) ?? []), r]);
  const rows: Record<string, unknown>[] = [];
  const now = new Date();
  for (const c of clients ?? []) {
    if (c.tipo_lead === "consultoria" || c.tipo_lead === "pessoa_fisica") continue;
    const start = licenseStart(c.data_inicio_contrato, c.data_renovacao);
    const plan = planJourney(
      { licenseStart: start, tagUso: c.tag_uso, now },
      byClient.get(c.client_uid) ?? [],
      cfg,
    );
    if (!plan.length) continue;
    const to = await pickRecipient(c.client_uid);
    for (const p of plan) {
      const tpl = cfg.emails.find((e) => e.id === p.emailId);
      rows.push({
        client_uid: c.client_uid,
        email_id: p.emailId,
        due_at: p.dueAt,
        status: p.status,
        contact_id: to?.id ?? null,
        to_email: to?.email ?? null,
        to_name: to?.nome ?? null,
        subject: tpl?.assunto ?? null,
      });
    }
  }
  let created = 0;
  for (let i = 0; i < rows.length; i += 300) {
    const { error } = await supabaseAdmin
      .from("cs_journey_emails")
      .upsert(rows.slice(i, i + 300) as never, {
        onConflict: "client_uid,email_id",
        ignoreDuplicates: true,
      });
    if (error) throw new Error(error.message);
    created += Math.min(300, rows.length - i);
  }
  // agendado que chegou no dia vira pendente (ou expirado se passou da janela)
  const today = now.toISOString().slice(0, 10);
  const { data: due } = await supabaseAdmin
    .from("cs_journey_emails")
    .select("id, due_at")
    .eq("status", "agendado")
    .lte("due_at", today);
  for (const d of due ?? []) {
    const late = Math.floor((now.getTime() - new Date(d.due_at).getTime()) / 86400000);
    await supabaseAdmin
      .from("cs_journey_emails")
      .update({ status: late <= cfg.janela_dias ? "pendente" : "expirado" })
      .eq("id", d.id);
  }
  return { created, becamePending: (due ?? []).length };
}

/** Envia um marco (pendente ou agendado) agora. */
export async function sendJourneyEmail(id: string, sentBy: string | null) {
  const cfg = await getJourneyConfig();
  const { data: row, error } = await supabaseAdmin
    .from("cs_journey_emails")
    .select("*, cs_clients(nome_empresa, cs_responsavel_id)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Marco não encontrado");
  if (row.status === "enviado") throw new Error("Este e-mail já foi enviado");
  const tpl = cfg.emails.find((e) => e.id === row.email_id);
  if (!tpl) throw new Error("Modelo do e-mail não encontrado na configuração");
  let to = row.to_email;
  let toName = row.to_name;
  let contactId = row.contact_id;
  if (!to) {
    const c = await pickRecipient(row.client_uid);
    if (!c?.email) throw new Error("A empresa não tem contato com e-mail cadastrado");
    to = c.email;
    toName = c.nome;
    contactId = c.id;
  }
  const client = row.cs_clients as {
    nome_empresa: string;
    cs_responsavel_id: string | null;
  } | null;
  let replyTo: string | null = null;
  if (cfg.responder_para_responsavel && client?.cs_responsavel_id) {
    const { data: integ } = await supabaseAdmin
      .from("cs_user_integrations")
      .select("email_address")
      .eq("user_id", client.cs_responsavel_id)
      .maybeSingle();
    replyTo = integ?.email_address ?? null;
  }
  const text = renderJourneyBody(tpl.corpo, toName, cfg.assinatura);
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) throw new Error("RESEND_API_KEY não configurada");
  const res = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": resendKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${cfg.assinatura} · Grou <noreply@grougp.com.br>`,
      to: [to],
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject: tpl.assunto,
      html: `<div style="font-family:Inter,Arial,sans-serif;color:#111;max-width:640px">${journeyBodyToHtml(text)}</div>`,
      text,
    }),
  });
  const body = await res.text();
  if (!res.ok) {
    await supabaseAdmin
      .from("cs_journey_emails")
      .update({ status: "erro", error: body.slice(0, 500) })
      .eq("id", id);
    throw new Error(`Resend ${res.status}: ${body.slice(0, 200)}`);
  }
  const now = new Date().toISOString();
  await supabaseAdmin
    .from("cs_journey_emails")
    .update({
      status: "enviado",
      sent_at: now,
      sent_by: sentBy,
      to_email: to,
      to_name: toName,
      contact_id: contactId,
      subject: tpl.assunto,
      error: null,
    })
    .eq("id", id);
  // vira e-mail enviado na timeline (e evidência de e-mail)
  await supabaseAdmin.from("cs_emails").upsert(
    {
      message_id: `journey:${id}`,
      direction: "outbound",
      from_email: replyTo ?? "noreply@grougp.com.br",
      from_name: cfg.assinatura,
      to_emails: [to],
      cc_emails: [],
      subject: tpl.assunto,
      snippet: text.slice(0, 280),
      body_text: text,
      received_at: now,
      client_uid: row.client_uid,
      owner_user_id: client?.cs_responsavel_id ?? sentBy,
      mailbox: replyTo,
      raw: { journey_email_id: id, email_id: row.email_id } as never,
    },
    { onConflict: "message_id" },
  );
  return { ok: true, to };
}

/** Modo automático: envia o que está pendente com destinatário. */
export async function processJourneyEmails() {
  const cfg = await getJourneyConfig();
  const sched = await scheduleJourneyEmails();
  if (cfg.modo !== "automatico") return { ...sched, sent: 0, mode: cfg.modo };
  const { data: pending } = await supabaseAdmin
    .from("cs_journey_emails")
    .select("id")
    .eq("status", "pendente")
    .not("to_email", "is", null)
    .limit(50);
  let sent = 0;
  const errors: string[] = [];
  for (const p of pending ?? []) {
    try {
      await sendJourneyEmail(p.id, null);
      sent++;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  return { ...sched, sent, errors: errors.slice(0, 5), mode: cfg.modo };
}
