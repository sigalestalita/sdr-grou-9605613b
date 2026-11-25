/*
 * E-mail de boas-vindas de quem ganha acesso ao Compass — parte pura (sem
 * banco nem rede), usada na tela de usuários para montar o rascunho que o
 * admin edita e no servidor para transformar o texto editado em HTML.
 *
 * O texto é simples (linhas, links colados como URL); o HTML só acrescenta o
 * topo com o logo, o botão (definir senha ou entrar) e o rodapé.
 */
import type { Membership, Team } from "@/lib/teams";

export const COMPASS_URL = "https://compass.grougp.com";
/** Manual do Compass (CS e SDR), público, sem login. */
export const MANUAL_URL = `${COMPASS_URL}/manual`;
export const MANUAL_SDR_URL = `${MANUAL_URL}#modulo-sdr`;
export const MANUAL_CS_URL = `${MANUAL_URL}#modulo-cs`;
export const REMETENTE_BOAS_VINDAS = "Compass · Grou <noreply@grougp.com.br>";
const LOGO_URL = `${COMPASS_URL}/grou-logo-email.png`;
const COR = "#111827";

export const MAX_ASSUNTO = 200;
export const MAX_CORPO = 8000;

export type Manual = { nome: string; url: string };

/**
 * Atalhos para os capítulos do manual que são do time da pessoa: o Módulo SDR
 * para quem está num time comercial, o Módulo CS para quem está num time de
 * CS. Gestão enxerga tudo; sem time comercial nem de CS, vão os dois (o admin
 * apaga o que não fizer sentido).
 */
export function manuaisDaPessoa(memberships: Membership[], teams: Team[]): Manual[] {
  const bySlug = new Map(teams.map((t) => [t.slug, t]));
  let comercial = false;
  let cs = false;
  let gestao = false;
  for (const m of memberships) {
    const modulo = bySlug.get(m.team)?.modulo;
    if (modulo === "comercial") comercial = true;
    if (modulo === "cs") cs = true;
    if (m.access.includes("gestao")) gestao = true;
  }
  if (gestao || (!comercial && !cs)) comercial = cs = true;
  const out: Manual[] = [];
  if (comercial) out.push({ nome: "Módulo SDR (comercial)", url: MANUAL_SDR_URL });
  if (cs) out.push({ nome: "Módulo CS", url: MANUAL_CS_URL });
  return out;
}

export type DadosDoRascunho = {
  nome: string;
  email: string;
  memberships: Membership[];
  teams: Team[];
  /** Vai o botão "Definir minha senha" (conta criada sem senha). */
  comLinkDeSenha: boolean;
  /** Quem assina: o admin que está cadastrando. */
  remetente?: string | null;
};

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? "";

/** Assunto e texto padrão, para o admin revisar antes de enviar. */
export function rascunhoBoasVindas(d: DadosDoRascunho): { assunto: string; corpo: string } {
  const bySlug = new Map(d.teams.map((t) => [t.slug, t]));
  const times = d.memberships.map((m) => bySlug.get(m.team)?.nome ?? m.team).filter(Boolean);
  const manuais = manuaisDaPessoa(d.memberships, d.teams);
  const nome = primeiroNome(d.nome);

  const passos = [
    d.comLinkDeSenha
      ? "Defina sua senha pelo botão “Definir minha senha”, no fim deste e-mail. O link é de uso único e expira; se não funcionar, use “Esqueci minha senha” na tela de entrada."
      : `Entre em ${COMPASS_URL} com este e-mail e a senha que você recebeu de quem te cadastrou.`,
    `Leia o manual do Compass antes de começar: ${MANUAL_URL}. Ele mostra cada tela, o que o sistema faz sozinho e o que é com você. Comece pelo capítulo do seu time:`,
    "Na tela Início ficam as suas métricas e o que você tem para fazer hoje. Para achar qualquer empresa, lead ou cliente, use a busca no topo (Ctrl+K, ou ⌘K no Mac).",
    "Ficou com dúvida sobre alguma tela? Pergunte ao assistente do Compass, no canto da tela, ou fale com a gestão do seu time.",
  ];

  const linhas: string[] = [
    `Olá${nome ? `, ${nome}` : ""}!`,
    "",
    "Boas-vindas ao Compass, o CRM da Grou. É nele que acompanhamos leads, negócios e clientes, do primeiro contato ao pós-venda.",
    "",
    `Seu acesso: ${d.email}`,
  ];
  if (times.length) linhas.push(`Seu time: ${times.join(", ")}`);
  linhas.push("", "Para começar:");
  passos.forEach((p, i) => {
    linhas.push(`${i + 1}. ${p}`);
    if (i === 1) for (const m of manuais) linhas.push(`   • ${m.nome}: ${m.url}`);
  });
  linhas.push("", "Bom trabalho!", d.remetente?.trim() || "Equipe Grou");

  return { assunto: "Boas-vindas ao Compass, o CRM da Grou", corpo: linhas.join("\n") };
}

const ESC: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);

/** Escapa e transforma URLs http(s) em links. */
function linhaHtml(linha: string): string {
  const partes = linha.split(/(https?:\/\/[^\s<>"']+)/g);
  return partes
    .map((p, i) => {
      if (i % 2 === 0) return esc(p);
      // pontuação colada no fim da URL fica fora do link
      const m = p.match(/^(.*?)([.,;:!?)]*)$/);
      const url = m?.[1] ?? p;
      const resto = m?.[2] ?? "";
      return `<a href="${esc(url)}" style="color:#2563eb;">${esc(url)}</a>${esc(resto)}`;
    })
    .join("");
}

/** Texto editado → HTML do e-mail (parágrafos por linha em branco). */
export function montarHtmlBoasVindas(
  corpo: string,
  botao: { texto: string; url: string },
): { html: string; texto: string } {
  const paragrafos = corpo
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 14px 0;">${p
          .split("\n")
          .map((l) => {
            // recuo de lista (os "   • ") continua recuado no e-mail
            const recuo = l.match(/^ */)?.[0].length ?? 0;
            return "&nbsp;".repeat(recuo) + linhaHtml(l.slice(recuo));
          })
          .join("<br>")}</p>`,
    )
    .join("");

  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:0;background:#f5f6f8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:24px 12px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
<tr><td style="padding:22px 28px 18px;border-bottom:3px solid ${COR};"><img src="${LOGO_URL}" width="96" height="42" alt="grou" style="display:block;width:96px;height:auto;border:0;"></td></tr>
<tr><td style="padding:24px 28px 8px;color:#111827;font-size:15px;line-height:1.6;">${paragrafos}</td></tr>
<tr><td style="padding:4px 28px 28px;"><a href="${esc(botao.url)}" style="display:inline-block;background:${COR};color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:15px;">${esc(botao.texto)}</a></td></tr>
<tr><td style="padding:14px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;">Compass · Grou — <a href="${COMPASS_URL}" style="color:#6b7280;">compass.grougp.com</a></td></tr>
</table>
</td></tr>
</table>
</body></html>`;

  const texto = `${corpo.trim()}\n\n${botao.texto}: ${botao.url}`;
  return { html, texto };
}
