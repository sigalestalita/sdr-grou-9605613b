import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { weeksInColor } from "@/lib/cs/cadence";
import type { CsSignal } from "@/lib/cs-types";

/*
 * Bloco 13 do playbook: "Clientes em vermelho há 6+ meses — lista para
 * revisão estratégica". E-mail interno para diretoria e admin, com a lista
 * gerada pelo sistema: cliente, CS responsável, Executivo, renovação e
 * último contato. Destinatários: gestão + e-mails extras da configuração.
 */

export type RedListRow = {
  clientUid: string;
  nome: string;
  weeks: number;
  csName: string;
  execName: string;
  renewal: string | null;
  lastContact: string | null;
};

export async function computeRedList(minWeeks = 24): Promise<RedListRow[]> {
  const since = new Date(Date.now() - (minWeeks + 8) * 7 * 86400000).toISOString().slice(0, 10);
  const [{ data: clients }, { data: snaps }, { data: profiles }] = await Promise.all([
    supabaseAdmin
      .from("cs_clients")
      .select(
        "client_uid, nome_empresa, cs_responsavel_id, comercial_responsavel_id, data_renovacao, last_contact_at, tipo_lead",
      )
      .eq("ativo", true),
    supabaseAdmin
      .from("cs_signal_snapshots")
      .select("client_uid, week_start, signal")
      .gte("week_start", since)
      .order("week_start"),
    supabaseAdmin.from("profiles").select("id, full_name, email"),
  ]);
  const name = new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.email || "—"]));
  const hist = new Map<string, CsSignal[]>();
  for (const s of snaps ?? []) hist.set(s.client_uid, [...(hist.get(s.client_uid) ?? []), s.signal as CsSignal]);
  const out: RedListRow[] = [];
  for (const c of clients ?? []) {
    if (c.tipo_lead === "consultoria") continue;
    const { color, weeks } = weeksInColor(hist.get(c.client_uid) ?? []);
    if (color !== "vermelho" || weeks < minWeeks) continue;
    out.push({
      clientUid: c.client_uid,
      nome: c.nome_empresa,
      weeks,
      csName: c.cs_responsavel_id ? (name.get(c.cs_responsavel_id) ?? "—") : "Sem CS",
      execName: c.comercial_responsavel_id ? (name.get(c.comercial_responsavel_id) ?? "—") : "—",
      renewal: c.data_renovacao,
      lastContact: c.last_contact_at,
    });
  }
  return out.sort((a, b) => b.weeks - a.weeks);
}

async function recipients(): Promise<string[]> {
  const [{ data: roles }, { data: cfg }] = await Promise.all([
    supabaseAdmin.from("user_roles").select("user_id").in("role", ["gestao", "super_admin"]),
    supabaseAdmin.rpc("cs_escalation_config"),
  ]);
  const ids = [...new Set((roles ?? []).map((r) => r.user_id))];
  const { data: profiles } = ids.length
    ? await supabaseAdmin.from("profiles").select("email").in("id", ids)
    : { data: [] as { email: string | null }[] };
  const extra = ((cfg as { diretoria_emails?: string[] } | null)?.diretoria_emails ?? []).map((e) =>
    String(e).trim().toLowerCase(),
  );
  return [...new Set([...(profiles ?? []).map((p) => p.email).filter((e): e is string => !!e), ...extra])];
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

/** Envia a lista (mesmo vazia só se force). Devolve quantos clientes foram listados. */
export async function sendRedListEmail(opts?: { force?: boolean; minWeeks?: number }) {
  const rows = await computeRedList(opts?.minWeeks ?? 24);
  if (rows.length === 0 && !opts?.force) return { sent: false, clients: 0, skipped: "nenhum cliente" };
  const resendKey = process.env.RESEND_API_KEY;
  const to = await recipients();
  if (!resendKey || !to.length) return { sent: false, clients: rows.length, skipped: !resendKey ? "sem RESEND_API_KEY" : "sem destinatários" };
  const base = "https://project--773e2ce3-3b97-4224-ac14-c22657fc102a.lovable.app";
  const trs = rows
    .map(
      (r) => `<tr>
<td style="padding:6px 8px;border-bottom:1px solid #eee"><a href="${base}/empresas/${encodeURIComponent(r.clientUid)}">${esc(r.nome)}</a></td>
<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${r.weeks}</td>
<td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(r.csName)}</td>
<td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(r.execName)}</td>
<td style="padding:6px 8px;border-bottom:1px solid #eee">${fmt(r.renewal)}</td>
<td style="padding:6px 8px;border-bottom:1px solid #eee">${fmt(r.lastContact)}</td></tr>`,
    )
    .join("");
  const html = `<div style="font-family:Inter,Arial,sans-serif;color:#111;max-width:820px">
<h2 style="font-size:18px;margin:0 0 6px">Clientes em vermelho há 6+ meses — lista para revisão estratégica</h2>
<p style="font-size:13px;color:#444">Os seguintes clientes completaram 6 meses consecutivos em vermelho e precisam de avaliação estratégica:</p>
<table style="border-collapse:collapse;width:100%;font-size:13px"><thead><tr style="text-align:left;color:#666">
<th style="padding:6px 8px">Cliente</th><th style="padding:6px 8px;text-align:right">Semanas</th><th style="padding:6px 8px">CS responsável</th><th style="padding:6px 8px">Executivo</th><th style="padding:6px 8px">Renovação</th><th style="padding:6px 8px">Último contato</th></tr></thead>
<tbody>${trs || `<tr><td colspan="6" style="padding:8px;color:#666">Nenhum cliente nessa situação.</td></tr>`}</tbody></table>
<p style="font-size:13px;color:#444;margin-top:14px">Esses clientes estão além do que o CS pode resolver sozinho. A decisão sobre continuidade, ajuste de produto ou abordagem diferenciada precisa vir da liderança.</p>
</div>`;
  const res = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": resendKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Grou Compass <noreply@grougp.com.br>",
      to,
      subject: `Clientes em vermelho há 6+ meses — lista para revisão estratégica (${rows.length})`,
      html,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return { sent: true, clients: rows.length, to: to.length };
}
