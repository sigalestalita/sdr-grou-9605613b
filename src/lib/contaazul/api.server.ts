import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { itensDaResposta } from "./mapear";

/*
 * Conexão com a API da Conta Azul (OAuth2, api-v2.contaazul.com).
 *
 * O app é criado no Portal do Desenvolvedor da Conta Azul; o client_id e o
 * client_secret ficam nos secrets do Lovable (CONTAAZUL_CLIENT_ID e
 * CONTAAZUL_CLIENT_SECRET). O access_token vale 1 hora e o refresh_token
 * vale 2 anos, mas só pode ser usado UMA vez: cada renovação devolve um novo,
 * que substitui o anterior na hora.
 */
export const CA_API = "https://api-v2.contaazul.com";
export const CA_AUTHORIZE = "https://login.contaazul.com/#/oauth/authorize";
export const CA_TOKEN = "https://api-v2.contaazul.com/oauth/token";
export const CA_SCOPE = "openid+profile+aws.cognito.signin.user.admin";

const db = () => supabaseAdmin as unknown as SupabaseClient;

export function credenciais() {
  const id = process.env.CONTAAZUL_CLIENT_ID;
  const secret = process.env.CONTAAZUL_CLIENT_SECRET;
  if (!id || !secret)
    throw new Error(
      "Configure CONTAAZUL_CLIENT_ID e CONTAAZUL_CLIENT_SECRET nos secrets do Lovable",
    );
  return { id, secret, basic: `Basic ${btoa(`${id}:${secret}`)}` };
}

export function redirectUri(origin: string) {
  return `${origin}/api/public/conta-azul/callback`;
}

type Tokens = { access_token: string; refresh_token: string; expires_in?: number };

async function pedirToken(corpo: Record<string, string>): Promise<Tokens> {
  const { basic } = credenciais();
  const res = await fetch(CA_TOKEN, {
    method: "POST",
    headers: { Authorization: basic, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(corpo).toString(),
  });
  const texto = await res.text();
  if (!res.ok) throw new Error(`Conta Azul (token) ${res.status}: ${texto.slice(0, 300)}`);
  const j = JSON.parse(texto) as Partial<Tokens>;
  if (!j.access_token || !j.refresh_token) throw new Error("Conta Azul não devolveu os tokens");
  return j as Tokens;
}

async function guardar(t: Tokens, extra: Record<string, unknown> = {}) {
  const { error } = await db()
    .from("contaazul_tokens")
    .upsert({
      id: true,
      access_token: t.access_token,
      refresh_token: t.refresh_token,
      expires_at: new Date(Date.now() + ((t.expires_in ?? 3600) - 120) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
      ...extra,
    });
  if (error) throw new Error(error.message);
}

/** Troca o código do login pela primeira dupla de tokens. */
export async function trocarCodigo(code: string, origin: string, userId: string | null) {
  const t = await pedirToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(origin),
  });
  await guardar(t, { connected_at: new Date().toISOString(), connected_by: userId });
}

let renovando: Promise<string> | null = null;

/** Token válido (renova quando faltam 2 minutos). null = não conectado. */
export async function tokenAtual(): Promise<string | null> {
  const { data } = await db()
    .from("contaazul_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("id", true)
    .maybeSingle();
  const t = data as { access_token: string; refresh_token: string; expires_at: string } | null;
  if (!t) return null;
  if (new Date(t.expires_at).getTime() > Date.now()) return t.access_token;
  // Uma renovação por vez: o refresh_token só pode ser usado uma vez.
  renovando ??= pedirToken({ grant_type: "refresh_token", refresh_token: t.refresh_token })
    .then(async (novo) => {
      await guardar(novo);
      return novo.access_token;
    })
    .finally(() => {
      renovando = null;
    });
  return renovando;
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET na API com repetição quando o limite (10/s, 600/min) estoura. */
export async function caGet(caminho: string, params: Record<string, string | number | undefined>) {
  const token = await tokenAtual();
  if (!token) throw new Error("Conta Azul não conectada");
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== "") qs.set(k, String(v));
  const url = `${CA_API}${caminho}${qs.size ? `?${qs}` : ""}`;
  for (let tentativa = 0; ; tentativa++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 429 && tentativa < 4) {
      await espera(1000 * 2 ** tentativa);
      continue;
    }
    const texto = await res.text();
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Conta Azul ${caminho} ${res.status}: ${texto.slice(0, 300)}`);
    return texto ? (JSON.parse(texto) as unknown) : null;
  }
}

/** Todas as páginas de uma busca (para quando vem menos que uma página cheia). */
export async function caTodasAsPaginas(
  caminho: string,
  params: Record<string, string | number | undefined>,
  tamanho = 50,
  maxPaginas = 200,
) {
  const todos: Record<string, unknown>[] = [];
  for (let pagina = 1; pagina <= maxPaginas; pagina++) {
    const r = await caGet(caminho, { ...params, pagina, tamanho_pagina: tamanho });
    const itens = itensDaResposta(r);
    todos.push(...itens);
    if (itens.length < tamanho) break;
    await espera(120); // folga no limite de 10 por segundo
  }
  return todos;
}
