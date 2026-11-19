import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/*
 * E-mail interno do Compass para o time (executivo, ADM): complemento da
 * notificação do sino, para o que não pode passar batido — ficha recebida
 * para confirmar, faturamento devolvido. Falha no e-mail nunca derruba a
 * ação principal.
 */
const GATEWAY = "https://connector-gateway.lovable.dev/resend/emails";
const FROM = "Compass Grou <sdr@grougp.com.br>";
export const APP_URL = process.env.APP_PUBLIC_URL || "https://sdr-grou.lovable.app";

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** E-mails dos usuários (profiles), sem repetir e sem vazios. */
export async function emailsDosUsuarios(ids: Array<string | null | undefined>) {
  const unicos = [...new Set(ids.filter((i): i is string => !!i))];
  if (!unicos.length) return [];
  const { data } = await (supabaseAdmin as unknown as SupabaseClient)
    .from("profiles")
    .select("email")
    .in("id", unicos);
  return [
    ...new Set(
      ((data ?? []) as Array<{ email: string | null }>).map((p) => p.email).filter(Boolean),
    ),
  ] as string[];
}

export async function enviarEmailInterno(e: {
  para: string[];
  assunto: string;
  titulo: string;
  /** HTML já escapado (use esc() no que vier de fora). */
  corpoHtml: string;
  link?: string | null;
  botao?: string;
}): Promise<boolean> {
  const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!LOVABLE_API_KEY || !RESEND_API_KEY || e.para.length === 0) return false;
  const url = e.link ? (e.link.startsWith("http") ? e.link : `${APP_URL}${e.link}`) : null;
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f5f6f8;padding:24px;">
      <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
        <div style="background:#111827;color:#fff;padding:14px 24px;font-weight:700;font-size:15px;">Compass · Grou</div>
        <div style="padding:24px;color:#111827;font-size:14px;line-height:1.5;">
          <h2 style="margin:0 0 12px 0;font-size:18px;">${esc(e.titulo)}</h2>
          ${e.corpoHtml}
          ${url ? `<p style="margin:20px 0 0 0;"><a href="${esc(url)}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;">${esc(e.botao ?? "Abrir no Compass")}</a></p>` : ""}
        </div>
      </div>
    </div>`;
  try {
    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": RESEND_API_KEY,
      },
      body: JSON.stringify({ from: FROM, to: e.para, subject: e.assunto.slice(0, 200), html }),
    });
    if (!res.ok) console.error("[email-interno]", res.status, (await res.text()).slice(0, 300));
    return res.ok;
  } catch (err) {
    console.error("[email-interno]", err);
    return false;
  }
}
