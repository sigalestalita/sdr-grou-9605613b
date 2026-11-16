/*
 * Avisos da proposta por e-mail — parte pura (sem banco nem rede): quem
 * recebe, assunto e corpo. O envio fica em avisos-email.server.ts.
 */
import { z } from "zod";

export const COMPASS_URL = "https://compass.grougp.com";
export const REMETENTE_AVISOS = "Compass · Grou <noreply@grougp.com.br>";
export const MAX_AVISOS_EMAILS = 20;

const emailZ = z.string().trim().toLowerCase().email().max(200);

/** Lista de e-mails limpa: minúsculas, sem repetir, só os válidos. */
export function normalizarEmails(lista: readonly string[]): string[] {
  const out: string[] = [];
  for (const bruto of lista) {
    const r = emailZ.safeParse(bruto);
    if (r.success && !out.includes(r.data)) out.push(r.data);
  }
  return out;
}

/** Separa o texto digitado (vírgula, ponto e vírgula, espaço ou linha) em válidos e inválidos. */
export function lerEmailsDigitados(texto: string): { validos: string[]; invalidos: string[] } {
  const partes = texto
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const invalidos = partes.filter((s) => !emailZ.safeParse(s).success);
  return { validos: normalizarEmails(partes), invalidos };
}

/** A lista da proposta; vazia, o e-mail de quem enviou (ou criou) a proposta. */
export function destinatariosDoAviso(
  avisosEmails: readonly string[] | null | undefined,
  emailDoDono: string | null | undefined,
): string[] {
  const lista = normalizarEmails(avisosEmails ?? []);
  if (lista.length > 0) return lista;
  return normalizarEmails(emailDoDono ? [emailDoDono] : []);
}

export type EventoProposta =
  | { tipo: "abertura"; aberturas: number; totalSlides: number }
  | { tipo: "retorno"; aberturas: number; totalSlides: number; ultimaAntes: string }
  | { tipo: "todos_slides"; aberturas: number; vistos: number; total: number; titulo: string }
  | {
      tipo: "aceite";
      nome: string;
      cargo: string;
      email: string;
      documento: string | null;
    }
  | { tipo: "recusa"; motivo: string };

export type DadosDoAviso = {
  empresa: string;
  numero: number;
  versao: number;
  valor: string;
  dealId: string;
  /** ISO do momento do evento. */
  quando: string;
  /** "iPhone · Safari"… */
  aparelho: string;
  evento: EventoProposta;
};

export function dataHoraBrasilia(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return `${d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  })} (horário de Brasília)`;
}

export function assuntoDoAviso(d: Pick<DadosDoAviso, "empresa" | "numero" | "evento">): string {
  const n = `nº ${d.numero}`;
  switch (d.evento.tipo) {
    case "abertura":
      return `${d.empresa} abriu a proposta ${n}`;
    case "retorno":
      return `${d.empresa} voltou a abrir a proposta ${n}`;
    case "todos_slides":
      return `${d.empresa} viu todos os slides da proposta ${n}`;
    case "aceite":
      return `Proposta ${n} ACEITA por ${d.empresa}`;
    case "recusa":
      return `${d.empresa} recusou a proposta ${n}`;
  }
}

export const linkDoNegocio = (dealId: string) => `${COMPASS_URL}/negocio/${dealId}`;

function esc(s: string) {
  return s.replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!,
  );
}

/** Linhas "rótulo: valor" do corpo, na ordem em que aparecem. */
export function linhasDoAviso(d: DadosDoAviso): Array<[string, string]> {
  const e = d.evento;
  const quando: [string, string] = ["Quando", dataHoraBrasilia(d.quando)];
  const aparelho: [string, string] = ["Aparelho", d.aparelho || "Desconhecido"];
  const valor: [string, string] = ["Valor", d.valor];
  const slides = (total: number): Array<[string, string]> =>
    total > 0 ? [["Apresentação", `${total} slides`]] : [];
  switch (e.tipo) {
    case "abertura":
      return [quando, aparelho, ["Aberturas até agora", String(e.aberturas)], ...slides(e.totalSlides), valor];
    case "retorno":
      return [
        quando,
        aparelho,
        ["Aberturas até agora", String(e.aberturas)],
        ["Visita anterior", dataHoraBrasilia(e.ultimaAntes)],
        ...slides(e.totalSlides),
        valor,
      ];
    case "todos_slides":
      return [
        quando,
        aparelho,
        ["Slides vistos", `${e.vistos} de ${e.total}${e.titulo ? ` · ${e.titulo}` : ""}`],
        ["Aberturas até agora", String(e.aberturas)],
        valor,
      ];
    case "aceite":
      return [
        quando,
        ["Aceito por", e.nome],
        ["Cargo", e.cargo],
        ["E-mail", e.email],
        ["Documento", e.documento || "—"],
        valor,
        aparelho,
      ];
    case "recusa":
      return [quando, ["Motivo", e.motivo || "Sem motivo informado."], aparelho, valor];
  }
}

function frase(d: DadosDoAviso): string {
  const n = `nº ${d.numero} (versão ${d.versao})`;
  switch (d.evento.tipo) {
    case "abertura":
      return `${d.empresa} abriu a proposta ${n} pela primeira vez.`;
    case "retorno":
      return `${d.empresa} voltou a abrir a proposta ${n}.`;
    case "todos_slides":
      return `${d.empresa} chegou ao último slide da apresentação da proposta ${n}.`;
    case "aceite":
      return `${d.empresa} aceitou a proposta ${n}.`;
    case "recusa":
      return `${d.empresa} recusou a proposta ${n}.`;
  }
}

export function montarEmailDoAviso(d: DadosDoAviso): { assunto: string; html: string; texto: string } {
  const assunto = assuntoDoAviso(d);
  const linhas = linhasDoAviso(d);
  const link = linkDoNegocio(d.dealId);
  const destaque =
    d.evento.tipo === "aceite" ? "#0b6b3a" : d.evento.tipo === "recusa" ? "#a8071a" : "#003DA5";
  const tabela = linhas
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;font-size:13px;vertical-align:top;white-space:nowrap">${esc(k)}</td><td style="padding:6px 0;color:#0A0E1A;font-size:14px">${esc(v).replace(/\n/g, "<br>")}</td></tr>`,
    )
    .join("");
  const html = `<div style="background:#ffffff;padding:24px;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:560px;margin:0 auto;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
<div style="background:${destaque};color:#ffffff;padding:14px 24px;font-weight:700;font-size:15px">${esc(assunto)}</div>
<div style="padding:20px 24px">
<p style="margin:0 0 14px;color:#0A0E1A;font-size:15px;line-height:1.5">${esc(frase(d))}</p>
<table style="border-collapse:collapse;width:100%">${tabela}</table>
<p style="margin:22px 0 6px"><a href="${link}" style="display:inline-block;background:#0A0E1A;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:999px;font-weight:600;font-size:14px">Abrir no Compass</a></p>
<p style="margin:10px 0 0;color:#9ca3af;font-size:12px">Se o botão não abrir: ${link}</p>
</div></div>
<p style="max-width:560px;margin:12px auto 0;color:#9ca3af;font-size:11px">Aviso automático do Compass · Grou sobre a proposta nº ${d.numero}.</p>
</div>`;
  const texto = [
    frase(d),
    "",
    ...linhas.map(([k, v]) => `${k}: ${v}`),
    "",
    `Abrir no Compass: ${link}`,
  ].join("\n");
  return { assunto, html, texto };
}
