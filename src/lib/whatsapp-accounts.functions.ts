import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";

const REDACT = "••••••";

function redact<
  T extends { access_token?: string | null; webhook_secret?: string | null; metadata?: unknown },
>(row: T) {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  return {
    ...row,
    access_token: row.access_token ? REDACT : null,
    webhook_secret: row.webhook_secret ? REDACT : null,
    metadata: {
      ...meta,
      verify_token: meta.verify_token ? REDACT : undefined,
    },
  };
}

export const listAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("whatsapp_accounts")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    /*
     * A URL do webhook precisa ser a pública, não a do navegador.
     *
     * A tela montava o endereço com window.location.origin. Aberta pela
     * pré-visualização do Lovable, ela exibia o domínio da pré-visualização —
     * e esse endereço, colado na Meta, manda os webhooks para o lugar errado,
     * de um jeito que só aparece quando mensagem nenhuma chega.
     */
    return {
      accounts: (data ?? []).map(redact),
      publicUrl: (process.env.APP_PUBLIC_URL || "https://compass.groupp.com").replace(/\/+$/, ""),
    };
  });

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().min(1).max(120),
  phone_number: z.string().min(5).max(32),
  provider: z.enum(["meta_cloud", "mock"]).default("meta_cloud"),
  provider_instance_id: z.string().min(1).max(64), // phone_number_id
  access_token: z.string().optional(), // omit to keep current
  webhook_secret: z.string().optional(), // app_secret; omit to keep current
  verify_token: z.string().optional(), // omit to keep current
  waba_id: z.string().optional(),
  provider_base_url: z.string().optional(),
  is_default: z.boolean().default(false),
  status: z.enum(["active", "disabled"]).default("active"),
});

export const upsertAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => upsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // manager-only enforced by RLS (wa_accounts_manager_write), mas validamos para erro melhor:
    const { data: isMgr } = await supabase.rpc("is_manager", { _user_id: userId });
    if (!isMgr) throw new Error("Apenas gestores podem editar contas de WhatsApp.");

    // carrega atual para preservar segredos quando vazios
    let current: {
      access_token: string | null;
      webhook_secret: string;
      metadata: Record<string, unknown>;
    } | null = null;
    if (data.id) {
      const { data: row } = await supabase
        .from("whatsapp_accounts")
        .select("access_token, webhook_secret, metadata")
        .eq("id", data.id)
        .maybeSingle();
      if (row) {
        current = {
          access_token: row.access_token,
          webhook_secret: row.webhook_secret,
          metadata: (row.metadata as Record<string, unknown>) ?? {},
        };
      }
    }

    const metaPrev = (current?.metadata ?? {}) as Record<string, unknown>;
    const nextMetaObj: Record<string, unknown> = { ...metaPrev };
    if (data.verify_token) nextMetaObj.verify_token = data.verify_token.trim();
    if (data.waba_id !== undefined) nextMetaObj.waba_id = data.waba_id.trim() || undefined;
    const nextMeta = nextMetaObj as unknown as Json;

    const payload = {
      label: data.label,
      phone_number: data.phone_number.trim(),
      provider: data.provider,
      provider_instance_id: data.provider_instance_id.trim(),
      provider_base_url: data.provider_base_url?.trim() || null,
      access_token: data.access_token ? data.access_token.trim() : (current?.access_token ?? null),
      webhook_secret: data.webhook_secret
        ? data.webhook_secret.trim()
        : (current?.webhook_secret?.trim() ?? ""),
      metadata: nextMeta,
      is_default: data.is_default,
      status: data.status,
      owner_user_id: userId,
    };

    if (!payload.webhook_secret && data.provider === "meta_cloud") {
      throw new Error(
        "Informe o App Secret (webhook_secret) — usado para validar a assinatura HMAC.",
      );
    }

    // garante apenas uma default
    if (data.is_default) {
      await supabase
        .from("whatsapp_accounts")
        .update({ is_default: false })
        .neq("id", data.id ?? "00000000-0000-0000-0000-000000000000");
    }

    if (data.id) {
      const { error } = await supabase.from("whatsapp_accounts").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: ins, error } = await supabase
      .from("whatsapp_accounts")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: ins.id };
  });

export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("whatsapp_accounts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Envia uma mensagem de teste via a conta (texto livre) — útil para validar credenciais. */
export const testSendAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ id: z.string().uuid(), to: z.string().min(5), body: z.string().min(1).max(1000) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: isMgr } = await context.supabase.rpc("is_manager", { _user_id: context.userId });
    if (!isMgr) throw new Error("Apenas gestores.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: account, error } = await supabaseAdmin
      .from("whatsapp_accounts")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !account) throw new Error(error?.message || "Conta não encontrada.");
    const { getProvider } = await import("@/lib/whatsapp/provider-registry.server");
    const provider = getProvider(account.provider);
    const result = await provider.sendMessage({
      account: {
        id: account.id,
        phone_number: account.phone_number,
        provider: account.provider,
        provider_instance_id: account.provider_instance_id,
        provider_base_url: account.provider_base_url,
        access_token: account.access_token,
        webhook_secret: account.webhook_secret,
      },
      to: data.to,
      type: "text",
      body: data.body,
    });

    // Se o destinatário bate com um lead existente, grava no inbox (cria conversa se preciso)
    let inboxLinked: { leadId: string; conversationId: string } | null = null;
    if (result.status !== "failed") {
      const phone = data.to.replace(/\D+/g, "");
      const { acharLeadPorTelefone } = await import("@/lib/whatsapp/lead-match.server");
      const leadMatch = await acharLeadPorTelefone(supabaseAdmin, phone);
      if (leadMatch) {
        let { data: conv } = await supabaseAdmin
          .from("whatsapp_conversations")
          .select("id")
          .eq("lead_id", leadMatch.id)
          .maybeSingle();
        if (!conv) {
          const ins = await supabaseAdmin
            .from("whatsapp_conversations")
            .insert({
              lead_id: leadMatch.id,
              account_id: account.id,
              assigned_user_id: leadMatch.assigned_to ?? context.userId,
              status: "open",
            })
            .select("id")
            .single();
          conv = ins.data;
        }
        if (conv) {
          const ts = new Date().toISOString();
          await supabaseAdmin.from("whatsapp_messages").insert({
            conversation_id: conv.id,
            lead_id: leadMatch.id,
            sender_type: "agent",
            sender_user_id: context.userId,
            message_type: "text",
            body: data.body,
            provider_message_id: result.providerMessageId || null,
            status: result.status === "sending" ? "sent" : result.status,
            sent_at: ts,
          });
          await supabaseAdmin
            .from("whatsapp_conversations")
            .update({ last_message_at: ts, last_preview: data.body.slice(0, 200), status: "open" })
            .eq("id", conv.id);
          inboxLinked = { leadId: leadMatch.id, conversationId: conv.id };
        }
      }
    }
    return { ...result, inboxLinked };
  });

/** Registra o número na Meta Cloud API (POST /{phone_number_id}/register).
 *  Necessário uma única vez antes de enviar/receber mensagens. Define também o PIN
 *  da verificação em duas etapas. */
export const registerCloudNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ id: z.string().uuid(), pin: z.string().regex(/^\d{6}$/, "PIN deve ter 6 dígitos") })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: isMgr } = await context.supabase.rpc("is_manager", { _user_id: context.userId });
    if (!isMgr) throw new Error("Apenas gestores.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: account, error } = await supabaseAdmin
      .from("whatsapp_accounts")
      .select("provider, provider_instance_id, provider_base_url, access_token")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !account) throw new Error(error?.message || "Conta não encontrada.");
    if (account.provider !== "meta_cloud")
      throw new Error("Disponível apenas para Meta Cloud API.");
    if (!account.access_token) throw new Error("Conta sem Access Token salvo.");
    if (!account.provider_instance_id) throw new Error("Conta sem Phone Number ID.");
    const base = (account.provider_base_url || "https://graph.facebook.com/v21.0").replace(
      /\/+$/,
      "",
    );
    const url = `${base}/${account.provider_instance_id}/register`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${account.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messaging_product: "whatsapp", pin: data.pin }),
    });
    const text = await res.text();
    let json: {
      success?: boolean;
      error?: { message?: string; code?: number; error_subcode?: number };
    } = {};
    try {
      json = JSON.parse(text);
    } catch {
      /* ignore */
    }
    if (!res.ok || !json.success) {
      const msg = json.error?.message || `HTTP ${res.status}: ${text.slice(0, 300)}`;
      throw new Error(msg);
    }
    return { ok: true };
  });

/**
 * Eventos de webhook que o parser ainda não trata.
 *
 * Serve para a habilitação da coexistência: quando a Meta começar a mandar o
 * eco das mensagens digitadas no celular do SDR, o histórico das conversas ou
 * a sincronização de contatos, é aqui que dá para ver com que nome de campo e
 * em que formato eles chegam — antes de escrever o tratamento.
 */
export const listWebhookEventosNaoTratados = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isManager } = await supabase.rpc("is_manager", { _user_id: userId });
    if (!isManager) return { disponivel: true, eventos: [], porCampo: [] };

    // A tabela é nova; os tipos gerados só a conhecem depois da migration.
    const db = supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          order: (
            c: string,
            o: { ascending: boolean },
          ) => {
            limit: (n: number) => Promise<{
              data: Array<Record<string, unknown>> | null;
              error: { message: string } | null;
            }>;
          };
        };
      };
    };
    const { data, error } = await db
      .from("whatsapp_webhook_events")
      .select("id, field, payload, received_at")
      .order("received_at", { ascending: false })
      .limit(50);
    // Sem a migration aplicada a tabela não existe — e isso é informação útil,
    // não erro: quem abre a tela precisa saber por que a lista está vazia.
    if (error) return { disponivel: false, eventos: [], porCampo: [] };

    const eventos = (data ?? []).map((e) => ({
      id: e.id as string,
      field: e.field as string,
      recebidoEm: e.received_at as string,
      resumo: JSON.stringify(e.payload ?? {}).slice(0, 4000),
    }));
    const contagem = new Map<string, number>();
    for (const e of eventos) contagem.set(e.field, (contagem.get(e.field) ?? 0) + 1);
    return {
      disponivel: true,
      eventos,
      porCampo: [...contagem].map(([field, n]) => ({ field, n })).sort((a, b) => b.n - a.n),
    };
  });

/**
 * Configuração pública do Embedded Signup, para a tela montar o pop-up.
 *
 * O App ID e o config_id não são segredo — aparecem na URL do fluxo da Meta.
 * O App Secret nunca sai do servidor.
 */
export const getEmbeddedSignupConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isMgr } = await context.supabase.rpc("is_manager", {
      _user_id: context.userId,
    });
    if (!isMgr)
      return {
        pronto: false,
        appId: null as string | null,
        configId: null as string | null,
        temSecret: false,
        faltando: [] as string[],
        pessoas: [] as Array<{ id: string; nome: string }>,
      };

    /*
     * O App ID e o config_id não são segredo: aparecem na URL do fluxo da
     * Meta. Ficam em app_settings, editáveis na tela, para não depender de
     * variável de ambiente — que no Lovable é recurso de plano pago. Só o App
     * Secret continua no ambiente, porque esse é segredo de verdade.
     */
    const [{ data: cfgRow }, { data: perfis }] = await Promise.all([
      context.supabase
        .from("app_settings")
        .select("value")
        .eq("key", "whatsapp_embedded_signup")
        .maybeSingle(),
      context.supabase.from("profiles").select("id, full_name, email").order("full_name"),
    ]);
    const cfg = (cfgRow?.value ?? {}) as { app_id?: string; config_id?: string };

    const appId = (cfg.app_id || process.env.META_APP_ID || "").trim() || null;
    const configId = (cfg.config_id || process.env.META_ES_CONFIG_ID || "").trim() || null;
    const temSecret = !!process.env.META_APP_SECRET;

    // Quem pode ser dono de um número: o SDR cujo celular está no aparelho.
    const pessoas = (perfis ?? []).map((p) => ({
      id: p.id as string,
      nome: (p.full_name || p.email || p.id) as string,
    }));

    const faltando = [
      appId ? null : "App ID",
      configId ? null : "ID da configuração (config_id)",
      temSecret ? null : "META_APP_SECRET",
    ].filter(Boolean) as string[];

    return { pronto: faltando.length === 0, appId, configId, temSecret, faltando, pessoas };
  });

/** Guarda App ID e config_id, que são públicos, direto na tela. */
export const salvarEmbeddedSignupConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        appId: z.string().regex(/^\d{6,}$/, "O App ID é só números"),
        configId: z.string().regex(/^\d{6,}$/, "O config_id é só números"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: isMgr } = await context.supabase.rpc("is_manager", {
      _user_id: context.userId,
    });
    if (!isMgr) throw new Error("Apenas gestores configuram a conexão com a Meta.");

    const { data: atual } = await context.supabase
      .from("app_settings")
      .select("value")
      .eq("key", "whatsapp_embedded_signup")
      .maybeSingle();
    const value = {
      ...((atual?.value ?? {}) as Record<string, unknown>),
      app_id: data.appId.trim(),
      config_id: data.configId.trim(),
    };
    const { error } = await context.supabase.from("app_settings").upsert({
      key: "whatsapp_embedded_signup",
      value,
      updated_at: new Date().toISOString(),
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Conclui a conexão de um número que já roda no app WhatsApp Business.
 *
 * Recebe o que o pop-up da Meta devolveu, troca o código pelo token
 * permanente, assina o webhook no WABA e cria (ou atualiza) a conta no
 * sistema, já no nome do SDR dono do aparelho.
 *
 * Não chama /register de propósito: registrar um número de coexistência
 * desconecta o app do celular, que é exatamente o que não queremos.
 */
export const concluirEmbeddedSignup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        code: z.string().min(10),
        phoneNumberId: z.string().min(3),
        wabaId: z.string().min(3),
        ownerUserId: z.string().uuid().nullable().optional(),
        label: z.string().max(120).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: isMgr } = await context.supabase.rpc("is_manager", {
      _user_id: context.userId,
    });
    if (!isMgr) throw new Error("Apenas gestores conectam contas de WhatsApp.");

    const { trocarCodigoPorToken, assinarWebhookDoWaba, dadosDoNumero } =
      await import("@/lib/whatsapp/embedded-signup.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const token = await trocarCodigoPorToken(data.code);
    await assinarWebhookDoWaba(data.wabaId, token);
    const info = await dadosDoNumero(data.phoneNumberId, token);

    // Mesmo número reconectado: atualiza em vez de duplicar a conta.
    const { data: existente } = await supabaseAdmin
      .from("whatsapp_accounts")
      .select("id, metadata")
      .eq("provider_instance_id", data.phoneNumberId)
      .maybeSingle();

    const metadata = {
      ...(((existente?.metadata as Record<string, unknown>) ?? {}) as Record<string, unknown>),
      waba_id: data.wabaId,
      coexistencia: true,
      conectado_em: new Date().toISOString(),
    };
    const patch = {
      label: data.label?.trim() || info.verifiedName || info.displayPhoneNumber || "WhatsApp",
      phone_number: (info.displayPhoneNumber ?? "").replace(/\D+/g, "") || data.phoneNumberId,
      provider: "meta_cloud",
      provider_instance_id: data.phoneNumberId,
      access_token: token,
      status: "connected",
      owner_user_id: data.ownerUserId ?? null,
      metadata,
      updated_at: new Date().toISOString(),
    };

    if (existente) {
      const { error } = await supabaseAdmin
        .from("whatsapp_accounts")
        .update(patch as never)
        .eq("id", existente.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: existente.id, criada: false, numero: info.displayPhoneNumber };
    }

    const { data: criada, error } = await supabaseAdmin
      .from("whatsapp_accounts")
      .insert(patch as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: criada.id, criada: true, numero: info.displayPhoneNumber };
  });

/**
 * Lista os números de uma conta do WhatsApp Business, pelo token.
 *
 * Existe para não depender de alguém copiar o Phone Number ID à mão de outra
 * tela — é um número de 15 dígitos, e um dígito errado dá "conta não
 * encontrada" sem dizer por quê. Com o WABA ID e o token, a própria Meta
 * responde quais números existem e qual é o id de cada um.
 */
export const listarNumerosDoWaba = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        wabaId: z.string().min(3),
        accessToken: z.string().min(20),
        baseUrl: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: isMgr } = await context.supabase.rpc("is_manager", {
      _user_id: context.userId,
    });
    if (!isMgr) throw new Error("Apenas gestores.");

    const base = (data.baseUrl || "https://graph.facebook.com/v21.0").replace(/\/+$/, "");
    const url =
      `${base}/${encodeURIComponent(data.wabaId)}/phone_numbers` +
      `?fields=id,display_phone_number,verified_name,quality_rating,platform_type`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${data.accessToken}` } });
    const json = (await res.json()) as {
      data?: Array<{
        id?: string;
        display_phone_number?: string;
        verified_name?: string;
        quality_rating?: string;
        platform_type?: string;
      }>;
      error?: { message?: string; error_user_msg?: string };
    };
    if (!res.ok) {
      throw new Error(
        json.error?.error_user_msg || json.error?.message || `Meta respondeu ${res.status}`,
      );
    }
    return {
      numeros: (json.data ?? []).map((n) => ({
        id: (n.id as string) ?? "",
        numero: n.display_phone_number ?? "",
        nome: n.verified_name ?? "",
        qualidade: n.quality_rating ?? null,
        // "CLOUD_API" ou o app do celular: diz se o número é de coexistência.
        plataforma: n.platform_type ?? null,
      })),
    };
  });

/**
 * Assina o app no WABA da conta.
 *
 * Sem isso o número fica conectado, as credenciais aparecem ok e mensagem
 * nenhuma chega — porque a Meta só entrega webhook para apps assinados
 * naquela conta. É o passo que some no cadastro manual: o fluxo do Embedded
 * Signup faz sozinho, o formulário não fazia.
 */
export const assinarWebhookDaConta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isMgr } = await context.supabase.rpc("is_manager", {
      _user_id: context.userId,
    });
    if (!isMgr) throw new Error("Apenas gestores.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: conta, error } = await supabaseAdmin
      .from("whatsapp_accounts")
      .select("access_token, metadata, provider")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !conta) throw new Error(error?.message || "Conta não encontrada");
    if (conta.provider !== "meta_cloud") throw new Error("Só vale para Meta Cloud API.");

    const wabaId = (conta.metadata as { waba_id?: string } | null)?.waba_id;
    if (!wabaId) throw new Error("Conta sem WABA ID — preencha o campo antes de assinar.");
    if (!conta.access_token) throw new Error("Conta sem Access Token salvo.");

    const { assinarWebhookDoWaba } = await import("@/lib/whatsapp/embedded-signup.server");
    await assinarWebhookDoWaba(wabaId, conta.access_token);
    return { ok: true, wabaId };
  });

/**
 * Pergunta à Meta por que uma conta não está recebendo.
 *
 * "Credenciais ok" só diz que o token responde. Entre isso e a mensagem
 * aparecer no inbox há três coisas que falham em silêncio, e nenhuma delas dá
 * erro em lugar nenhum:
 *
 *   1. o app não está assinado naquela conta do WhatsApp Business;
 *   2. o número não é de coexistência, então o que é digitado no celular nem
 *      passa pela API;
 *   3. o campo de eco não está assinado no webhook do app.
 *
 * Os dois primeiros a Meta responde. O terceiro depende do token do app, que
 * nem sempre está à mão — então a tela diz o que conferir à mão.
 */
export const diagnosticarConta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isMgr } = await context.supabase.rpc("is_manager", {
      _user_id: context.userId,
    });
    if (!isMgr) throw new Error("Apenas gestores.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: conta, error } = await supabaseAdmin
      .from("whatsapp_accounts")
      .select("access_token, metadata, provider, provider_instance_id, provider_base_url")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !conta) throw new Error(error?.message || "Conta não encontrada");

    const base = (conta.provider_base_url || "https://graph.facebook.com/v21.0").replace(
      /\/+$/,
      "",
    );
    const token = conta.access_token ?? "";
    const wabaId = (conta.metadata as { waba_id?: string } | null)?.waba_id ?? null;
    const checks: Array<{ ok: boolean | null; titulo: string; detalhe: string }> = [];

    if (!token) {
      checks.push({ ok: false, titulo: "Token", detalhe: "A conta não tem Access Token salvo." });
      return { checks };
    }

    // 1) o app está assinado no WABA?
    if (!wabaId) {
      checks.push({
        ok: false,
        titulo: "WABA ID",
        detalhe: "Sem WABA ID não dá para assinar o app nem conferir a assinatura.",
      });
    } else {
      try {
        const res = await fetch(`${base}/${encodeURIComponent(wabaId)}/subscribed_apps`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = (await res.json()) as {
          data?: Array<{ whatsapp_business_api_data?: { name?: string; id?: string } }>;
          error?: { message?: string };
        };
        if (!res.ok) {
          checks.push({
            ok: false,
            titulo: "App assinado na conta",
            detalhe: json.error?.message ?? `Meta respondeu ${res.status}`,
          });
        } else {
          const apps = (json.data ?? [])
            .map((a) => a.whatsapp_business_api_data?.name)
            .filter(Boolean);
          checks.push({
            ok: apps.length > 0,
            titulo: "App assinado na conta",
            detalhe: apps.length
              ? `Assinado: ${apps.join(", ")}`
              : "Nenhum app assinado — clique no botão de assinar. Sem isso a Meta não envia webhook nenhum.",
          });
        }
      } catch (e) {
        checks.push({
          ok: false,
          titulo: "App assinado na conta",
          detalhe: e instanceof Error ? e.message : "Falha ao consultar",
        });
      }
    }

    // 2) o número é de coexistência?
    if (conta.provider_instance_id) {
      try {
        const res = await fetch(
          `${base}/${encodeURIComponent(conta.provider_instance_id)}?fields=platform_type,display_phone_number,verified_name,quality_rating`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const json = (await res.json()) as {
          platform_type?: string;
          display_phone_number?: string;
          error?: { message?: string };
        };
        if (!res.ok) {
          checks.push({
            ok: false,
            titulo: "Número na Meta",
            detalhe: json.error?.message ?? `Meta respondeu ${res.status}`,
          });
        } else {
          const p = (json.platform_type ?? "").toUpperCase();
          const naCloud = p === "CLOUD_API";
          const doApp = p.includes("SMB") || p.includes("BUSINESS_APP");
          checks.push({
            ok: true,
            titulo: "Número na Meta",
            detalhe: `${json.display_phone_number ?? ""} · plataforma ${p || "não informada"}`,
          });
          /*
           * platform_type é o que decide se a integração pode existir.
           *
           * Vincular o WhatsApp Business ao portfólio empresarial dá um ativo e
           * um phone_number_id, e isso faz a conta parecer pronta. Mas enquanto
           * o número não estiver hospedado na Cloud API, nada trafega pela API:
           * nem envio, nem recebimento, nem eco. ON_PREMISE ou NOT_APPLICABLE
           * quer dizer exatamente isso — vinculado, não conectado.
           */
          checks.push({
            ok: naCloud || doApp ? true : false,
            titulo: "Pronto para a API",
            detalhe: naCloud
              ? "Número hospedado na Cloud API: envio e recebimento passam por aqui."
              : doApp
                ? "Número do app WhatsApp Business em coexistência: o que for digitado no celular chega por eco."
                : `A Meta devolve "${p || "vazio"}", e não CLOUD_API. O número está vinculado ao portfólio, mas não conectado à API — é o que dá um phone_number_id e faz a conta parecer pronta. Enquanto o onboarding de coexistência não for concluído no WhatsApp Manager, nada trafega: nem envio, nem recebimento, nem eco. Nenhum ajuste de webhook resolve isso.`,
          });
        }
      } catch (e) {
        checks.push({
          ok: false,
          titulo: "Número na Meta",
          detalhe: e instanceof Error ? e.message : "Falha ao consultar",
        });
      }
    }

    // 3) campos do webhook: só o token do app responde, então é conferência manual
    checks.push({
      ok: null,
      titulo: "Campos do webhook",
      detalhe:
        "Confira no app, em WhatsApp → Configuração → Campos do webhook, se messages e smb_message_echoes estão assinados. O eco é o que traz a mensagem digitada no celular; sem ele só chega o que o lead envia.",
    });

    return { checks };
  });
