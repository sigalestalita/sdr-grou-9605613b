/*
 * Montagem do e-mail de campanha — parte pura, sem banco (testável).
 *
 * O corpo é escrito em texto simples:
 *   # Título                      → título
 *   linha em branco               → novo parágrafo
 *   - item                        → lista
 *   **negrito**  *itálico*  __sublinhado__
 *   {cor:#c2410c}texto{/cor}      → texto colorido
 *   {fundo:#fef08a}texto{/fundo}  → marca-texto
 *   [texto](https://…)            → link
 *   [[Texto do botão|https://…]]  → botão
 *   ![descrição](https://…/img.png)              → imagem (linha sozinha)
 *   ![descrição|50%](https://…/img.png)(https://…) → imagem menor, com link
 *   ---                           → divisória
 *   -> texto                      → parágrafo centralizado
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
  /** Imagem do topo da campanha (URL https). Sem ela, vai o logo da Grou. */
  imagemTopo?: string | null;
};

/** Logo da Grou no topo de todo e-mail que não tem imagem própria. */
export const LOGO_EMAIL_URL = "https://compass.grougp.com/grou-logo-email.png";

/** Topo do e-mail: a imagem da campanha em largura cheia, ou o logo da Grou. */
export function topoDoEmail(imagemTopo?: string | null): string {
  const img = imagemTopo?.trim();
  if (img && /^https:\/\//i.test(img))
    return `<tr><td style="padding:0;line-height:0;font-size:0;"><img src="${esc(img)}" width="600" alt="Grou" style="display:block;width:100%;max-width:600px;height:auto;border:0;"></td></tr>`;
  return `<tr><td style="background:#ffffff;padding:22px 28px 18px;border-bottom:3px solid ${COR};"><img src="${LOGO_EMAIL_URL}" width="96" height="42" alt="grou" style="display:block;width:96px;height:auto;border:0;"></td></tr>`;
}

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

const COR_OK = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Marcação dentro da linha. Recursiva: dá para combinar (negrito colorido,
 * itálico dentro de link etc.). Cor inválida sai como texto sem cor.
 */
function inline(linha: string, link: (u: string) => string): string {
  let out = "";
  let i = 0;
  const re =
    /\*\*(.+?)\*\*|\*([^*\s](?:[^*]*?[^*\s])?)\*|__(.+?)__|\{(cor|fundo):(#[0-9a-fA-F]{3,6})\}(.+?)\{\/\4\}|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s)<]+)/g;
  for (const m of linha.matchAll(re)) {
    const at = m.index ?? 0;
    out += esc(linha.slice(i, at));
    if (m[1] != null) out += `<strong>${inline(m[1], link)}</strong>`;
    else if (m[2] != null) out += `<em>${inline(m[2], link)}</em>`;
    else if (m[3] != null) out += `<u>${inline(m[3], link)}</u>`;
    else if (m[4] != null) {
      const dentro = inline(m[6], link);
      if (!COR_OK.test(m[5])) out += dentro;
      else if (m[4] === "cor") out += `<span style="color:${m[5]};">${dentro}</span>`;
      else
        out += `<span style="background:${m[5]};padding:0 2px;border-radius:2px;">${dentro}</span>`;
    } else if (m[7] != null)
      out += `<a href="${esc(link(m[8]))}" style="color:${COR_BOTAO};text-decoration:underline;">${inline(m[7], link)}</a>`;
    else out += `<a href="${esc(link(m[9]))}" style="color:${COR_BOTAO};">${esc(m[9])}</a>`;
    i = at + m[0].length;
  }
  return out + esc(linha.slice(i));
}

/** Imagem no meio do e-mail: ![descrição|largura%](https://img)(https://link opcional). */
const RE_IMAGEM =
  /^\s*!\[([^\]|]*)(?:\|(\d{1,3})%)?\]\((https:\/\/[^\s)]+)\)(?:\((https?:\/\/[^\s)]+)\))?\s*$/;

function imagemHtml(m: RegExpExecArray, link: (u: string) => string): string {
  const pct = Math.min(100, Math.max(10, Number(m[2] ?? 100)));
  const larg = Math.round((544 * pct) / 100);
  const img = `<img src="${esc(m[3])}" width="${larg}" alt="${esc(m[1].trim())}" style="display:inline-block;width:100%;max-width:${larg}px;height:auto;border:0;border-radius:6px;">`;
  const conteudo = m[4]
    ? `<a href="${esc(link(m[4]))}" style="text-decoration:none;">${img}</a>`
    : img;
  return `<p style="margin:8px 0 20px 0;text-align:center;line-height:0;">${conteudo}</p>`;
}

/** Texto simples → HTML do miolo do e-mail. */
export function textoParaHtml(texto: string, link: (u: string) => string = (u) => u): string {
  const partes: string[] = [];
  let paragrafo: string[] = [];
  let centro = false;
  let lista: string[] | null = null;
  const fecharP = () => {
    if (paragrafo.length)
      partes.push(
        `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#1f2937;${centro ? "text-align:center;" : ""}">${paragrafo.map((l) => inline(l, link)).join("<br>")}</p>`,
      );
    paragrafo = [];
    centro = false;
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
    const imagem = RE_IMAGEM.exec(l);
    if (imagem) {
      fecharP();
      fecharL();
      partes.push(imagemHtml(imagem, link));
      continue;
    }
    if (/^\s*-{3,}\s*$/.test(l)) {
      fecharP();
      fecharL();
      partes.push(`<hr style="border:0;border-top:1px solid #e5e7eb;margin:8px 0 20px 0;">`);
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
    const centralizado = /^\s*->\s?(.*)$/.exec(l);
    if (centralizado) {
      if (paragrafo.length && !centro) fecharP();
      centro = true;
      paragrafo.push(centralizado[1].trim());
      continue;
    }
    if (centro) fecharP();
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
${topoDoEmail(o.imagemTopo)}
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
    .replace(
      /^\s*!\[([^\]|]*)(?:\|\d{1,3}%)?\]\([^)]+\)(?:\(([^)]+)\))?\s*$/gm,
      (_, alt: string, url?: string) =>
        [alt.trim() && `[${alt.trim()}]`, url].filter(Boolean).join(" "),
    )
    .replace(/^\s*->\s?/gm, "")
    .replace(/\{(cor|fundo):[^}]*\}(.+?)\{\/\1\}/g, "$2")
    .replace(/__(.+?)__/g, "$1")
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$1: $2")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*([^*\s](?:[^*]*?[^*\s])?)\*/g, "$1")
    .replace(/<[^>]+>/g, "")}\n\n—\nPara não receber mais: ${o.urlDescadastro}`;
  return { html, texto, assunto };
}

/** Variáveis usadas no texto que o Compass não conhece. */
export function variaveisDesconhecidas(texto: string): string[] {
  const conhecidas = new Set(["nome", "primeiro_nome", "empresa", "email"]);
  const achadas = [...texto.matchAll(/\{\{\s*([a-z_]+)/gi)].map((m) => m[1].toLowerCase());
  return [...new Set(achadas.filter((v) => !conhecidas.has(v)))];
}

export type Aviso = { nivel: "erro" | "atencao"; texto: string };

/**
 * O que revisar antes do disparo. "erro" impede o envio; "atencao" só avisa.
 */
export function avisosDoConteudo(c: {
  assunto: string;
  preheader?: string | null;
  corpo: string;
  formato: "texto" | "html";
}): Aviso[] {
  const a: Aviso[] = [];
  if (!c.assunto.trim()) a.push({ nivel: "erro", texto: "Sem assunto" });
  if (!c.corpo.trim()) a.push({ nivel: "erro", texto: "Corpo vazio" });
  const desconhecidas = variaveisDesconhecidas(`${c.assunto}\n${c.preheader ?? ""}\n${c.corpo}`);
  if (desconhecidas.length)
    a.push({
      nivel: "atencao",
      texto: `Variável desconhecida (sai vazia): ${desconhecidas.map((v) => `{{${v}}}`).join(", ")}`,
    });
  if (c.assunto.trim().length > 70)
    a.push({ nivel: "atencao", texto: "Assunto longo: no celular ele aparece cortado" });
  if (!c.preheader?.trim())
    a.push({
      nivel: "atencao",
      texto: "Sem pré-cabeçalho: a caixa de entrada mostra o começo do texto no lugar",
    });
  if (c.formato === "texto") {
    const linhas = c.corpo.split("\n");
    const imgs = linhas.filter((l) => /^\s*!\[/.test(l));
    const quebradas = imgs.filter((l) => !/^\s*!\[[^\]]*\]\(https:\/\/[^\s)]+\)/.test(l));
    if (quebradas.length)
      a.push({
        nivel: "erro",
        texto: `${quebradas.length} imagem(ns) com endereço inválido (precisa começar com https://)`,
      });
    const semDescricao = imgs.filter((l) => /^\s*!\[(\|\d+%)?\]/.test(l));
    if (semDescricao.length)
      a.push({
        nivel: "atencao",
        texto: `${semDescricao.length} imagem(ns) sem descrição: quem bloqueia imagens não vê nada no lugar`,
      });
    if (
      imgs.length > 0 &&
      c.corpo
        .replace(/^\s*!\[.*$/gm, "")
        .replace(/\s+/g, " ")
        .trim().length < 80
    )
      a.push({
        nivel: "atencao",
        texto: "Quase só imagem: e-mail sem texto tende a cair no spam",
      });
    const abertas = (c.corpo.match(/\{(cor|fundo):/g) ?? []).length;
    const fechadas = (c.corpo.match(/\{\/(cor|fundo)\}/g) ?? []).length;
    if (abertas !== fechadas)
      a.push({ nivel: "atencao", texto: "Tem marcação de cor sem fechar ({/cor} ou {/fundo})" });
  }
  // Imagem sem link não conta: o endereço dela não é clicável.
  const semImagens = c.corpo.replace(/^\s*!\[[^\]]*\]\([^)]*\)(?!\()/gm, "");
  if (!/https?:\/\//.test(c.formato === "html" ? c.corpo.replace(/src="[^"]*"/g, "") : semImagens))
    a.push({ nivel: "atencao", texto: "Nenhum link ou botão: não vai dar para medir cliques" });
  return a;
}
