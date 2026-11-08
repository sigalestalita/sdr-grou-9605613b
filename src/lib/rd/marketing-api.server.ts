import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/*
 * API do RD Marketing (api.rd.services), autenticada por OAuth.
 * Aplicativo privado criado na App Store do RD; client_id e client_secret
 * ficam nos secrets (RD_MKT_CLIENT_ID, RD_MKT_CLIENT_SECRET). O refresh token
 * fica na tabela rd_marketing_conexao, que só o servidor lê.
 */
const API = "https://api.rd.services";
export const RDM_CALLBACK = "https://compass.grougp.com/api/public/rd-marketing/callback";
const db = () => supabaseAdmin as unknown as SupabaseClient;

function credenciais() {
  const id = process.env.RD_MKT_CLIENT_ID;
  const secret = process.env.RD_MKT_CLIENT_SECRET;
  if (!id || !secret)
    throw new Error(
      "Faltam os secrets RD_MKT_CLIENT_ID e RD_MKT_CLIENT_SECRET (aplicativo do RD Marketing)",
    );
  return { id, secret };
}

type Conexao = {
  refresh_token: string | null;
  access_token: string | null;
  expira_em: string | null;
  state: string | null;
  state_em: string | null;
  conectado_em: string | null;
  ultimo_erro: string | null;
};

async function lerConexao(): Promise<Conexao | null> {
  const { data } = await db().from("rd_marketing_conexao").select("*").eq("id", 1).maybeSingle();
  return (data as Conexao | null) ?? null;
}

async function gravar(campos: Partial<Conexao> & Record<string, unknown>) {
  const { error } = await db()
    .from("rd_marketing_conexao")
    .upsert({ id: 1, ...campos, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

export async function statusDaConexao() {
  const c = await lerConexao();
  return {
    temCredenciais: !!process.env.RD_MKT_CLIENT_ID && !!process.env.RD_MKT_CLIENT_SECRET,
    conectado: !!c?.refresh_token,
    conectadoEm: c?.conectado_em ?? null,
    ultimoErro: c?.ultimo_erro ?? null,
  };
}

/** Endereço para a pessoa autorizar o Compass na conta do RD Marketing. */
export async function urlDeConexao(): Promise<string> {
  const { id } = credenciais();
  const state = crypto.randomUUID();
  await gravar({ state, state_em: new Date().toISOString() });
  const u = new URL(`${API}/auth/dialog`);
  u.searchParams.set("client_id", id);
  u.searchParams.set("redirect_uri", RDM_CALLBACK);
  u.searchParams.set("state", state);
  return u.toString();
}

type Tokens = { access_token: string; refresh_token?: string; expires_in?: number };

async function pedirToken(corpo: Record<string, string>, tipo: "code" | "refresh_token") {
  const res = await fetch(`${API}/auth/token?token_by=${tipo}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(corpo),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`RD Marketing ${res.status}: ${txt.slice(0, 300)}`);
  return JSON.parse(txt) as Tokens;
}

/** Callback do OAuth: confere o state e troca o code pelos tokens. */
export async function concluirConexao(code: string, state: string, userId?: string | null) {
  const c = await lerConexao();
  const recente = c?.state_em && Date.now() - new Date(c.state_em).getTime() < 60 * 60_000;
  if (!c?.state || c.state !== state || !recente)
    throw new Error("Pedido de conexão inválido ou vencido. Clique em Conectar de novo.");
  const { id, secret } = credenciais();
  const t = await pedirToken({ client_id: id, client_secret: secret, code }, "code");
  await gravar({
    access_token: t.access_token,
    refresh_token: t.refresh_token ?? null,
    expira_em: new Date(Date.now() + ((t.expires_in ?? 86400) - 300) * 1000).toISOString(),
    state: null,
    conectado_em: new Date().toISOString(),
    conectado_por: userId ?? null,
    ultimo_erro: null,
  });
}

async function accessToken(forcar = false): Promise<string> {
  const c = await lerConexao();
  if (!c?.refresh_token) throw new Error("RD Marketing não conectado");
  if (!forcar && c.access_token && c.expira_em && new Date(c.expira_em).getTime() > Date.now())
    return c.access_token;
  const { id, secret } = credenciais();
  const t = await pedirToken(
    { client_id: id, client_secret: secret, refresh_token: c.refresh_token },
    "refresh_token",
  );
  await gravar({
    access_token: t.access_token,
    refresh_token: t.refresh_token ?? c.refresh_token,
    expira_em: new Date(Date.now() + ((t.expires_in ?? 86400) - 300) * 1000).toISOString(),
    ultimo_erro: null,
  });
  return t.access_token;
}

/** GET na API. 404 vira null; 429 espera e tenta de novo; 401 renova o token. */
export async function rdmGet<T>(caminho: string): Promise<T | null> {
  let token = await accessToken();
  for (let t = 0; t < 4; t++) {
    const res = await fetch(`${API}${caminho}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (res.status === 404) return null;
    if (res.status === 401) {
      token = await accessToken(true);
      continue;
    }
    if (res.status === 429) {
      const espera = Number(res.headers.get("retry-after")) || 2 + t * 3;
      await new Promise((r) => setTimeout(r, Math.min(espera, 20) * 1000));
      continue;
    }
    const txt = await res.text();
    if (!res.ok) {
      const msg = `RD Marketing ${res.status} ${caminho}: ${txt.slice(0, 200)}`;
      await gravar({ ultimo_erro: msg }).catch(() => undefined);
      throw new Error(msg);
    }
    return JSON.parse(txt) as T;
  }
  throw new Error(`RD Marketing: muitas tentativas em ${caminho}`);
}
