/*
 * Porta de entrada dos formulários do site (POST /api/public/mkt/conversao).
 * Só regras puras aqui: validação do corpo, CORS, idempotência e a decisão do
 * que fazer com o card. A gravação fica em conversao.server.ts.
 */
import { z } from "zod";

export const LIMITE_POR_IP = 20;
export const JANELA_LIMITE_MIN = 10;
export const JANELA_IDEMPOTENCIA_MIN = 10;
export const MAX_CORPO_BYTES = 64 * 1024;
export const MAX_RESPOSTAS_BYTES = 20 * 1024;

const ORIGENS_FIXAS = new Set(["https://www.grougp.com", "https://grougp.com"]);
const VERCEL = /^https:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.vercel\.app$/i;

/** O site, o domínio sem www e as prévias da Vercel. */
export function origemPermitida(origin: string | null | undefined): boolean {
  if (!origin) return false;
  return ORIGENS_FIXAS.has(origin) || VERCEL.test(origin);
}

export function cabecalhosCors(origin: string | null | undefined): Record<string, string> {
  const base: Record<string, string> = { Vary: "Origin" };
  if (!origemPermitida(origin)) return base;
  return {
    ...base,
    "Access-Control-Allow-Origin": origin as string,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

const textoOpcional = (max: number) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (typeof v === "string" ? v.trim() : ""))
    .pipe(z.string().max(max))
    .transform((v) => (v === "" ? null : v));

const booleano = z
  .union([z.boolean(), z.literal("true"), z.literal("false"), z.literal("on"), z.literal("1"), z.literal("0")])
  .optional()
  .transform((v) => v === true || v === "true" || v === "on" || v === "1");

export const corpoDaConversao = z.object({
  chave: z.string().trim().min(16, "chave inválida").max(64, "chave inválida"),
  nome: z.string().trim().min(1, "informe o nome").max(200),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(255)
    .email("e-mail inválido"),
  telefone: textoOpcional(40),
  empresa: textoOpcional(200),
  pagina_url: textoOpcional(2000),
  utm_source: textoOpcional(200),
  utm_medium: textoOpcional(200),
  utm_campaign: textoOpcional(200),
  aceita_contato: booleano,
  respostas: z
    .record(z.string().max(120), z.unknown())
    .optional()
    .default({})
    .refine((r) => Object.keys(r).length <= 60, "respostas: no máximo 60 campos")
    .refine(
      (r) => new TextEncoder().encode(JSON.stringify(r)).length <= MAX_RESPOSTAS_BYTES,
      "respostas: grande demais",
    ),
  site: z.unknown().optional(),
  teste: booleano,
});

export type CorpoDaConversao = z.output<typeof corpoDaConversao>;

/** Honeypot: humano não vê o campo `site`; robô preenche. */
export function caiuNoHoneypot(corpo: unknown): boolean {
  if (!corpo || typeof corpo !== "object") return false;
  const v = (corpo as Record<string, unknown>).site;
  if (v === undefined || v === null || v === false) return false;
  return String(v).trim() !== "";
}

/** Telefone no formato usado no kanban (+55...). */
export function normalizarTelefone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = String(raw).replace(/\D+/g, "");
  if (d.length < 8) return null;
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return `+${d}`;
  if (d.length >= 10 && d.length <= 11) return `+55${d}`;
  return `+${d}`;
}

/**
 * Mesmo e-mail no mesmo ativo dentro da janela não duplica. A chave cobre a
 * corrida de dois envios simultâneos; a consulta dos últimos 10 min cobre a
 * virada da janela.
 */
export function chaveDeIdempotencia(ativoId: string, email: string, agora: Date): string {
  const janela = Math.floor(agora.getTime() / (JANELA_IDEMPOTENCIA_MIN * 60_000));
  return `site:${ativoId}:${email.trim().toLowerCase()}:${janela}`;
}

export type RegraPassagem = "nunca" | "sempre" | "por_pontuacao";

export type CardExistente = {
  id: string;
  oculto: boolean;
  etapaSlug: string | null;
  etapaTerminal: boolean;
} | null;

export type Acao =
  | "so_conversao"
  | "criar_card"
  | "registrar_no_card_existente"
  | "reativar_card";

/**
 * O que fazer com o card do SDR.
 * - `nunca`: só a conversão e o contato, sem card.
 * - `por_pontuacao` ainda não tem pontuação: entrega ao SDR (padrão seguro).
 * - card aberto (ou em etapa final) com o mesmo e-mail: não cria outro, registra nele.
 * - card escondido do kanban (base antiga do RD): volta para "Novo lead".
 */
export function decidirAcao(regra: RegraPassagem, card: CardExistente): Acao {
  if (regra === "nunca") return "so_conversao";
  if (!card) return "criar_card";
  if (card.oculto) return "reativar_card";
  return "registrar_no_card_existente";
}

export function descreverAcao(acao: Acao): string {
  switch (acao) {
    case "so_conversao":
      return "Registraria só a conversão e o contato (o ativo não passa ao SDR).";
    case "criar_card":
      return "Criaria um card novo em Novo lead no kanban do SDR.";
    case "registrar_no_card_existente":
      return "Já existe card com este e-mail: registraria a conversão nele, sem criar outro.";
    case "reativar_card":
      return "Existe card escondido do kanban com este e-mail: traria de volta para Novo lead.";
  }
}
