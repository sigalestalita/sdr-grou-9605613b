import { supabaseAdmin } from "@/integrations/supabase/client.server";

/*
 * Escalação ao gestor: o banco calcula (cs_refresh_escalations) o que atrasou
 * além do limite ou ficou sem ação; aqui só se avisa a gestão por e-mail,
 * uma vez por dia por ação, e só enquanto ela continuar escalada.
 */

type Notice = {
  kind: string;
  ref_id: string;
  client_uid: string;
  owner_id: string | null;
  title: string;
  due_at: string;
  days_late: number;
  acted: boolean;
  reason: string;
  notified_at: string | null;
  acknowledged_at: string | null;
};

const KIND_LABEL: Record<string, string> = {
  tarefa: "Tarefa",
  cadencia: "Cadência",
  reuniao: "Próximo passo",
  alerta: "Alerta",
};
const REASON_LABEL: Record<string, string> = {
  atraso: "atrasada",
  sem_acao: "sem nenhuma ação com a empresa",
  atraso_sem_acao: "atrasada e sem nenhuma ação com a empresa",
};

/** E-mails da gestão (gestao + super_admin). */
async function managerEmails(): Promise<string[]> {
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .in("role", ["gestao", "super_admin"]);
  const ids = [...new Set((roles ?? []).map((r) => r.user_id))];
  if (!ids.length) return [];
  const { data: profiles } = await supabaseAdmin.from("profiles").select("email").in("id", ids);
  return (profiles ?? []).map((p) => p.email).filter((e): e is string => !!e);
}

export async function notifyEscalationsByEmail(opts?: { force?: boolean }) {
  const { data: cfgRaw } = await supabaseAdmin.rpc("cs_escalation_config");
  const cfg = (cfgRaw ?? {}) as { notificar_email?: boolean };
  await supabaseAdmin.rpc("cs_refresh_escalations");
  if (cfg.notificar_email === false && !opts?.force) return { sent: 0, skipped: "desligado" };

  const since = new Date(Date.now() - 24 * 3600000).toISOString();
  const { data: rows, error } = await supabaseAdmin
    .from("cs_escalation_notices")
    .select(
      "kind, ref_id, client_uid, owner_id, title, due_at, days_late, acted, reason, notified_at, acknowledged_at",
    )
    .is("resolved_at", null)
    .is("acknowledged_at", null)
    .order("days_late", { ascending: false });
  if (error) throw new Error(error.message);
  const pending = ((rows ?? []) as Notice[]).filter(
    (n) => opts?.force || !n.notified_at || n.notified_at < since,
  );
  if (!pending.length) return { sent: 0, skipped: "nada novo" };

  const resendKey = process.env.RESEND_API_KEY;
  const to = await managerEmails();
  if (!resendKey || !to.length)
    return { sent: 0, skipped: !resendKey ? "sem RESEND_API_KEY" : "sem gestores" };

  const [{ data: clients }, { data: profiles }] = await Promise.all([
    supabaseAdmin
      .from("cs_clients")
      .select("client_uid, nome_empresa")
      .in("client_uid", [...new Set(pending.map((n) => n.client_uid))]),
    supabaseAdmin.from("profiles").select("id, full_name, email"),
  ]);
  const clientName = new Map((clients ?? []).map((c) => [c.client_uid, c.nome_empresa]));
  const ownerName = new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.email || "—"]));
  const base = "https://project--773e2ce3-3b97-4224-ac14-c22657fc102a.lovable.app";

  const byOwner = new Map<string, Notice[]>();
  for (const n of pending) {
    const k = n.owner_id ?? "—";
    byOwner.set(k, [...(byOwner.get(k) ?? []), n]);
  }
  const esc = (s: string) =>
    s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  const sections = [...byOwner.entries()]
    .map(([owner, list]) => {
      const rowsHtml = list
        .map(
          (n) => `<tr>
  <td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(KIND_LABEL[n.kind] ?? n.kind)}</td>
  <td style="padding:6px 8px;border-bottom:1px solid #eee"><a href="${base}/empresas/${encodeURIComponent(n.client_uid)}">${esc(clientName.get(n.client_uid) ?? n.client_uid)}</a></td>
  <td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(n.title)}</td>
  <td style="padding:6px 8px;border-bottom:1px solid #eee;white-space:nowrap">${n.days_late} dia(s)</td>
  <td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(REASON_LABEL[n.reason] ?? n.reason)}</td>
</tr>`,
        )
        .join("");
      return `<h3 style="margin:18px 0 6px;font-size:14px">${esc(owner === "—" ? "Sem responsável" : (ownerName.get(owner) ?? owner))} · ${list.length}</h3>
<table style="border-collapse:collapse;width:100%;font-size:13px"><thead><tr style="text-align:left;color:#666">
<th style="padding:6px 8px">Tipo</th><th style="padding:6px 8px">Empresa</th><th style="padding:6px 8px">Ação</th><th style="padding:6px 8px">Atraso</th><th style="padding:6px 8px">Motivo</th></tr></thead><tbody>${rowsHtml}</tbody></table>`;
    })
    .join("");
  const html = `<div style="font-family:Inter,Arial,sans-serif;color:#111;max-width:760px">
<h2 style="font-size:18px;margin:0 0 4px">Escalações do CS — ${pending.length} ação(ões) precisam de você</h2>
<p style="color:#555;font-size:13px;margin:0 0 8px">Ações com a empresa que passaram do limite de atraso ou ficaram sem nenhum contato registrado. Dê ciência ou reatribua no <a href="${base}/cs-dashboard">Dashboard CS</a>.</p>
${sections}
<p style="color:#888;font-size:12px;margin-top:18px">Você recebe este aviso por ser gestor. Ajuste a regra em Configurações CS → Tarefas e evidência.</p></div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Grou Compass <noreply@grougp.com.br>",
      to,
      subject: `[CS] ${pending.length} escalação(ões) — ações atrasadas ou sem retorno`,
      html,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const now = new Date().toISOString();
  for (const n of pending)
    await supabaseAdmin
      .from("cs_escalation_notices")
      .update({ notified_at: now })
      .eq("kind", n.kind)
      .eq("ref_id", n.ref_id);
  return { sent: pending.length, to: to.length };
}
