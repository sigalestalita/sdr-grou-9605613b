/*
 * Montagem do e-mail de campanha — parte pura, sem banco (testável).
 *
 * O corpo é escrito em texto simples:
 *   # Título                      → título
 *   linha em branco               → novo parágrafo
 *   - item                        → lista
 *   **negrito**                   → negrito
 *   [texto](https://…)            → link
 *   [[Texto do botão|https://…]]  → botão
 *   {{primeiro_nome}} {{nome}} {{empresa}} {{email}} → dados do contato
 * ou em HTML (formato "html"), que vai como está dentro do layout.
 *
 * Todo e-mail sai com rodapé de descadastro. Links passam pelo rastreio de
 * clique e uma imagem de 1px registra a abertura.
 */

export type Contato = { nome?: string | null; empresa?: string | null; email: string };

export type OpcoesRender = {
  assunto: string;
  preheader?: string | null;
  corpo: string;
  formato: "texto" | "html";
  contato: Contato;
  /** Monta a URL de rastreio de clique; null = links diretos (prévia). */
  urlClique?: ((destino: string) => string) | null;
  urlAbertura?: string | null;
  urlDescadastro: string;
};

const ESC: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);

export function primeiroNome(nome?: string | null): string {
  const n = (nome ?? "").trim().split(/\s+/)[0] ?? "";
  if (!n || /@/.test(n)) return "";
  return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
}

export function variaveis(c: Contato): Record<string, string> {
  return {
    nome: (c.nome ?? "").trim(),
    primeiro_nome: primeiroNome(c.nome),
    empresa: (c.empresa ?? "").trim(),
    email: c.email,
  };
}

/** Troca {{variavel}}; {{primeiro_nome|tudo bem}} usa o padrão quando vazio. */
export function trocar(texto: string, vars: Record<string, string>): string {
  return texto.replace(
    /\{\{\s*([a-z_]+)\s*(?:\|([^}]*))?\}\}/gi,
    (_, k: string, padrao?: string) => {
      const v = vars[k.toLowerCase()];
      return v ? v : (padrao ?? "").trim();
    },
  );
}

const COR = "#0b1f3a";
const COR_BOTAO = "#1e4f9c";

function inline(linha: string, link: (u: string) => string): string {
  let out = "";
  let i = 0;
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s)<]+)/g;
  for (const m of linha.matchAll(re)) {
    const at = m.index ?? 0;
    out += esc(linha.slice(i, at));
    if (m[1] != null) out += `<strong>${esc(m[1])}</strong>`;
    else if (m[2] != null)
      out += `<a href="${esc(link(m[3]))}" style="color:${COR_BOTAO};text-decoration:underline;">${esc(m[2])}</a>`;
    else out += `<a href="${esc(link(m[4]))}" style="color:${COR_BOTAO};">${esc(m[4])}</a>`;
    i = at + m[0].length;
  }
  return out + esc(linha.slice(i));
}

/** Texto simples → HTML do miolo do e-mail. */
export function textoParaHtml(texto: string, link: (u: string) => string = (u) => u): string {
  const partes: string[] = [];
  let paragrafo: string[] = [];
  let lista: string[] | null = null;
  const fecharP = () => {
    if (paragrafo.length)
      partes.push(
        `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#1f2937;">${paragrafo.map((l) => inline(l, link)).join("<br>")}</p>`,
      );
    paragrafo = [];
  };
  const fecharL = () => {
    if (lista)
      partes.push(
        `<ul style="margin:0 0 16px 0;padding-left:20px;font-size:15px;line-height:1.6;color:#1f2937;">${lista.map((l) => `<li style="margin:0 0 6px 0;">${inline(l, link)}</li>`).join("")}</ul>`,
      );
    lista = null;
  };
  for (const bruta of texto.replace(/\r/g, "").split("\n")) {
    const l = bruta.trimEnd();
    if (!l.trim()) {
      fecharP();
      fecharL();
      continue;
    }
    const botao = /^\s*\[\[([^|\]]+)\|(https?:\/\/[^\]\s]+)\]\]\s*$/.exec(l);
    if (botao) {
      fecharP();
      fecharL();
      partes.push(
        `<p style="margin:8px 0 24px 0;"><a href="${esc(link(botao[2]))}" style="display:inline-block;background:${COR_BOTAO};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:8px;">${esc(botao[1].trim())}</a></p>`,
      );
      continue;
    }
    const item = /^\s*[-•*]\s+(.*)$/.exec(l);
    if (item) {
      fecharP();
      lista ??= [];
      lista.push(item[1]);
      continue;
    }
    fecharL();
    const h = /^(#{1,3})\s+(.*)$/.exec(l);
    if (h) {
      fecharP();
      const tam = h[1].length === 1 ? 22 : h[1].length === 2 ? 18 : 16;
      partes.push(
        `<h${h[1].length} style="margin:8px 0 12px 0;font-size:${tam}px;line-height:1.3;color:${COR};">${inline(h[2], link)}</h${h[1].length}>`,
      );
      continue;
    }
    paragrafo.push(l.trim());
  }
  fecharP();
  fecharL();
  return partes.join("\n");
}

/** Reescreve os href de um HTML pronto para passar pelo rastreio. */
export function rastrearLinksHtml(html: string, link: (u: string) => string): string {
  return html.replace(/href="(https?:\/\/[^"]+)"/gi, (_, u: string) => `href="${esc(link(u))}"`);
}

export function renderEmail(o: OpcoesRender): { html: string; texto: string; assunto: string } {
  const vars = variaveis(o.contato);
  const link = o.urlClique ?? ((u: string) => u);
  const corpo = trocar(o.corpo, vars);
  const miolo = o.formato === "html" ? rastrearLinksHtml(corpo, link) : textoParaHtml(corpo, link);
  const assunto = trocar(o.assunto, vars);
  const pre = trocar(o.preheader ?? "", vars);
  const html = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(assunto)}</title></head>
<body style="margin:0;padding:0;background:#f3f5f9;">
${pre ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(pre)}</div>` : ""}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f5f9;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;">
<tr><td style="background:${COR};padding:18px 28px;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.5px;">grou</td></tr>
<tr><td style="padding:28px;">
${miolo}
</td></tr>
<tr><td style="padding:18px 28px;background:#f8fafc;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.5;color:#6b7280;">
Você recebeu este e-mail porque tem relacionamento com a Grou.<br>
Não quer mais receber? <a href="${esc(o.urlDescadastro)}" style="color:#6b7280;text-decoration:underline;">Descadastre-se</a>.
</td></tr>
</table>
</td></tr></table>
${o.urlAbertura ? `<img src="${esc(o.urlAbertura)}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px;">` : ""}
</body></html>`;
  const texto = `${corpo
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$1: $2")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/<[^>]+>/g, "")}\n\n—\nPara não receber mais: ${o.urlDescadastro}`;
  return { html, texto, assunto };
}

/** Variáveis usadas no texto que o Compass não conhece. */
export function variaveisDesconhecidas(texto: string): string[] {
  const conhecidas = new Set(["nome", "primeiro_nome", "empresa", "email"]);
  const achadas = [...texto.matchAll(/\{\{\s*([a-z_]+)/gi)].map((m) => m[1].toLowerCase());
  return [...new Set(achadas.filter((v) => !conhecidas.has(v)))];
}
