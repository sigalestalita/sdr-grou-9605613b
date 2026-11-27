/*
 * E-mail da menção (@): quem foi marcado recebe, além do sino no Compass, um
 * e-mail com o que foi escrito e o link. Parte pura (monta o e-mail).
 */
export const REMETENTE_MENCAO = "Compass · Grou <noreply@grougp.com.br>";
export const COMPASS = "https://compass.grougp.com";

const esc = (t: string) =>
  t.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

export function linkAbsoluto(link: string | null | undefined): string {
  if (!link) return COMPASS;
  if (/^https?:\/\//i.test(link)) return link;
  return `${COMPASS}${link.startsWith("/") ? "" : "/"}${link}`;
}

export function montarEmailDaMencao(n: {
  titulo: string;
  corpo?: string | null;
  link?: string | null;
  /** Linha do rodapé; padrão: "Você foi mencionado(a) no Compass". */
  rodape?: string;
}): { assunto: string; html: string; texto: string } {
  const url = linkAbsoluto(n.link);
  const corpo = (n.corpo ?? "").trim();
  const assunto = n.titulo.slice(0, 180);
  const texto = [n.titulo, corpo ? `\n${corpo}` : "", `\nAbrir no Compass: ${url}`].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;">
<tr><td style="padding:22px 28px 6px;font-size:16px;font-weight:bold;">${esc(n.titulo)}</td></tr>
${corpo ? `<tr><td style="padding:6px 28px 4px;font-size:14px;line-height:1.5;white-space:pre-wrap;color:#374151;">${esc(corpo)}</td></tr>` : ""}
<tr><td style="padding:16px 28px 24px;"><a href="${esc(url)}" style="display:inline-block;background:#0b1f5c;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:bold;">Abrir no Compass</a></td></tr>
<tr><td style="padding:12px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;">${esc(n.rodape ?? "Você foi mencionado(a) no Compass")} · <a href="${COMPASS}" style="color:#6b7280;">compass.grougp.com</a></td></tr>
</table></td></tr></table></body></html>`;
  return { assunto, html, texto };
}
