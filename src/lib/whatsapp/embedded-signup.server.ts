/*
 * Embedded Signup: conectar ao sistema um número que já roda no app WhatsApp
 * Business do celular do SDR — a "coexistência".
 *
 * Por que não dá para cadastrar à mão, como as outras contas: o número já
 * existe no aparelho de alguém. O aperto de mão passa por uma confirmação no
 * próprio celular (leitura de QR), e só a Meta consegue conduzir isso. O que
 * volta para nós é um `code`, que aqui vira o token permanente do número.
 *
 * A diferença prática para um número novo de Cloud API: ali chamamos
 * /register com um PIN de 6 dígitos. Aqui NÃO — registrar um número de
 * coexistência desconecta o app do celular, que é justamente o que não
 * queremos.
 */

const GRAPH = "https://graph.facebook.com/v21.0";

export type DadosDoSignup = {
  code: string;
  phoneNumberId: string;
  wabaId: string;
  /** Número em si, só para rotular a conta antes de consultar a Meta. */
  displayPhoneNumber?: string | null;
};

function credenciais() {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error(
      "META_APP_ID e META_APP_SECRET não estão configurados nas variáveis de ambiente",
    );
  }
  return { appId, appSecret };
}

/** Troca o código do pop-up pelo token permanente daquele número. */
export async function trocarCodigoPorToken(code: string): Promise<string> {
  const { appId, appSecret } = credenciais();
  const url =
    `${GRAPH}/oauth/access_token` +
    `?client_id=${encodeURIComponent(appId)}` +
    `&client_secret=${encodeURIComponent(appSecret)}` +
    `&code=${encodeURIComponent(code)}`;
  const res = await fetch(url);
  const json = (await res.json()) as {
    access_token?: string;
    error?: { message?: string; error_user_msg?: string };
  };
  if (!res.ok || !json.access_token) {
    throw new Error(
      json.error?.error_user_msg || json.error?.message || `Meta ${res.status} ao trocar o código`,
    );
  }
  return json.access_token;
}

/**
 * Assina o app no WABA.
 *
 * Sem isso o número conecta mas não chega webhook nenhum — nem mensagem do
 * lead, nem eco do que o SDR digitou no celular. É o passo que costuma ser
 * esquecido e faz parecer que a coexistência não funcionou.
 */
export async function assinarWebhookDoWaba(wabaId: string, token: string): Promise<void> {
  const res = await fetch(`${GRAPH}/${encodeURIComponent(wabaId)}/subscribed_apps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Falha ao assinar o webhook do WABA: ${txt.slice(0, 300)}`);
  }
}

/** Nome e número de exibição, para a conta não nascer sem rótulo. */
export async function dadosDoNumero(
  phoneNumberId: string,
  token: string,
): Promise<{ displayPhoneNumber: string | null; verifiedName: string | null }> {
  const res = await fetch(
    `${GRAPH}/${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return { displayPhoneNumber: null, verifiedName: null };
  const json = (await res.json()) as {
    display_phone_number?: string;
    verified_name?: string;
  };
  return {
    displayPhoneNumber: json.display_phone_number ?? null,
    verifiedName: json.verified_name ?? null,
  };
}

/**
 * Pede à Meta a agenda e o histórico do app do celular.
 *
 * Só funciona nas primeiras 24 horas depois da conexão — passou disso, o
 * histórico anterior não vem mais. Por isso é chamado no fim do Embedded
 * Signup, sem esperar ninguém lembrar. A Meta responde na hora só com um id;
 * as conversas chegam depois, em lotes, pelo webhook (campos `history` e
 * `smb_app_state_sync`).
 *
 * A agenda vai primeiro: com os nomes salvos no celular, as conversas do
 * histórico já entram com nome.
 */
export async function pedirSincronizacaoDoApp(
  phoneNumberId: string,
  token: string,
): Promise<{ contatos: string; historico: string }> {
  async function pedir(syncType: "smb_app_state_sync" | "history") {
    const res = await fetch(`${GRAPH}/${encodeURIComponent(phoneNumberId)}/smb_app_data`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", sync_type: syncType }),
    });
    const txt = await res.text();
    if (!res.ok) {
      let msg = txt.slice(0, 300);
      try {
        const j = JSON.parse(txt) as { error?: { message?: string; error_user_msg?: string } };
        msg = j.error?.error_user_msg || j.error?.message || msg;
      } catch {
        /* texto cru serve */
      }
      return `erro: ${msg}`;
    }
    return "pedido";
  }
  const contatos = await pedir("smb_app_state_sync");
  const historico = await pedir("history");
  return { contatos, historico };
}
