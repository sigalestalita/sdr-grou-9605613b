/*
 * Google Agenda de todo o domínio, sem cada pessoa conectar.
 *
 * Uma conta de serviço do Google Cloud com delegação em todo o domínio,
 * autorizada pelo admin do Google Workspace (Admin Console → Segurança →
 * Acesso e controle de dados → Controles de API → Delegação em todo o
 * domínio) só com o escopo de leitura de agenda. O Compass assina um JWT em
 * nome de cada pessoa (sub = e-mail dela) e lê a agenda principal.
 *
 * A chave fica no secret GOOGLE_SERVICE_ACCOUNT_JSON do Lovable Cloud (o JSON
 * inteiro da chave). Nunca sai do servidor.
 */

export const ESCOPO_DELEGACAO = "https://www.googleapis.com/auth/calendar.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

type ChaveServico = { client_email: string; private_key: string; client_id?: string };

/** Lê a chave do secret. null quando não está configurada ou não é uma chave válida. */
export function chaveDaDelegacao(): ChaveServico | null {
  const bruto = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!bruto) return null;
  try {
    const j = JSON.parse(bruto) as Partial<ChaveServico>;
    if (!j.client_email || !j.private_key) return null;
    return { client_email: j.client_email, private_key: j.private_key, client_id: j.client_id };
  } catch {
    return null;
  }
}

/** O que a tela pode mostrar (nada secreto): o ID do cliente vai no Admin Console. */
export function statusDaDelegacao() {
  const k = chaveDaDelegacao();
  const bruto = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  return {
    configurada: !!k,
    chaveInvalida: !!bruto && !k,
    clientId: k?.client_id ?? null,
    contaDeServico: k?.client_email ?? null,
    escopo: ESCOPO_DELEGACAO,
  };
}

const b64url = (bytes: Uint8Array | string) => {
  const bin =
    typeof bytes === "string" ? bytes : Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

function pemParaDer(pem: string): ArrayBuffer {
  const corpo = pem
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(corpo);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/** JWT RS256 assinado com a chave da conta de serviço, em nome de `email`. */
export async function jwtDaDelegacao(chave: ChaveServico, email: string, agora = Date.now()) {
  const iat = Math.floor(agora / 1000);
  const cabecalho = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const corpo = b64url(
    JSON.stringify({
      iss: chave.client_email,
      sub: email,
      scope: ESCOPO_DELEGACAO,
      aud: TOKEN_URL,
      iat,
      exp: iat + 3600,
    }),
  );
  const chaveCripto = await crypto.subtle.importKey(
    "pkcs8",
    pemParaDer(chave.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const assinatura = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    chaveCripto,
    new TextEncoder().encode(`${cabecalho}.${corpo}`),
  );
  return `${cabecalho}.${corpo}.${b64url(new Uint8Array(assinatura))}`;
}

/**
 * Token de acesso à agenda de `email` pela delegação. null quando não há
 * delegação configurada; erro legível quando o Google recusa (delegação não
 * autorizada no Admin Console, pessoa fora do domínio).
 */
export async function tokenPelaDelegacao(email: string): Promise<string | null> {
  const chave = chaveDaDelegacao();
  if (!chave) return null;
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: await jwtDaDelegacao(chave, email),
    }),
  });
  const tok = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };
  if (res.ok && tok.access_token) return tok.access_token;
  if (tok.error === "unauthorized_client")
    throw new Error(
      "O Google recusou a delegação: no Admin Console, autorize o ID do cliente da conta de serviço com o escopo de leitura de agenda.",
    );
  if (tok.error === "invalid_grant")
    throw new Error(`O Google não aceitou ${email} na delegação (conta fora do Workspace?).`);
  throw new Error(tok.error_description ?? `Google respondeu ${res.status}`);
}
