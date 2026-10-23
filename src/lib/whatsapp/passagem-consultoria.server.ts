import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { contaDaDona } from "./conta-da-dona.server";
import { getProvider } from "./provider-registry.server";
import { resolveTemplateSendParams } from "./template-send.server";

/*
 * Passagem anunciada para o número da consultoria.
 *
 * O lead converte como empresa, cai no rodízio e começa a conversa no número
 * de uma SDR. No meio da conversa aparece que é consultoria, e a dona passa a
 * ser a de consultoria. Ficar no número da SDR não funciona: a dona nova
 * escreveria pelo celular de outra pessoa, com o nome e a foto dela.
 *
 * Então é a única troca de número que existe, e é anunciada: a IA avisa no
 * número atual quem vai seguir, e a dona nova se apresenta pelo número dela
 * com um template — o lead ainda não escreveu para esse número, então a
 * janela de 24h não existe lá. A conversa no Compass é a mesma; muda o número
 * por onde ela segue.
 */

type Admin = SupabaseClient<Database>;

export type ResultadoDaPassagem =
  | "passou"
  | "dona_sem_numero"
  | "mesmo_numero"
  | "sem_template"
  | "falhou";

const primeiroNome = (nome?: string | null) =>
  (nome ?? "").trim().split(/\s+/).filter(Boolean)[0] ?? "";

/** O aviso que sai no número atual, antes da troca. */
export function avisoDePassagem(nomeDaDona: string) {
  const quem = primeiroNome(nomeDaDona) || "a responsável pelas consultorias";
  return (
    `Pelo que você me contou, quem vai seguir com você é ${quem}, que cuida das ` +
    `consultorias parceiras aqui na Grou. Em instantes ${quem} te chama por outro ` +
    `número de WhatsApp 😊`
  );
}

export async function passarParaNumeroDaConsultoria(params: {
  admin: Admin;
  conversaId: string;
  leadId: string;
  /** Conta pela qual a conversa está seguindo agora. */
  contaAtual: {
    id: string;
    provider: string;
    phone_number: string;
    provider_instance_id: string | null;
    provider_base_url: string | null;
    access_token: string | null;
    webhook_secret: string;
  };
  telefone: string;
}): Promise<ResultadoDaPassagem> {
  const { admin, conversaId, leadId, contaAtual, telefone } = params;

  const { data: lead } = await admin
    .from("leads")
    .select("name, company_name, assigned_to")
    .eq("id", leadId)
    .maybeSingle();
  const donaId = lead?.assigned_to ?? null;
  const destino = await contaDaDona(admin, donaId);
  // Sem número da dona, a conversa segue onde está e ela responde pelo Compass.
  if (!destino) return "dona_sem_numero";
  if (destino.id === contaAtual.id) return "mesmo_numero";

  const { data: cfgRow } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "whatsapp_ai_agent")
    .maybeSingle();
  const templateId = (cfgRow?.value as { consultoriaPassagemTemplateId?: string } | null)
    ?.consultoriaPassagemTemplateId;
  const { data: tmpl } = templateId
    ? await admin.from("whatsapp_templates").select("*").eq("id", templateId).maybeSingle()
    : { data: null };
  if (!tmpl || tmpl.status !== "approved" || !tmpl.provider_template_name) {
    console.warn("[passagem consultoria] template de apresentação ausente ou não aprovado");
    return "sem_template";
  }
  // Aprovado na Grou não basta: precisa estar aprovado no WABA da dona.
  const { templateNaConta } = await import("./templates-por-waba.server");
  const noDestino = await templateNaConta(admin, destino, tmpl);
  if (!noDestino) {
    console.warn("[passagem consultoria] template ainda não aprovado no WABA da dona");
    return "sem_template";
  }

  const { data: perfil } = await admin
    .from("profiles")
    .select("full_name, email")
    .eq("id", donaId as string)
    .maybeSingle();
  const nomeDaDona = perfil?.full_name || perfil?.email || "";
  const agora = () => new Date().toISOString();

  // 1) O aviso, no número em que o lead está falando.
  const aviso = avisoDePassagem(nomeDaDona);
  const { data: msgAviso } = await admin
    .from("whatsapp_messages")
    .insert({
      conversation_id: conversaId,
      lead_id: leadId,
      sender_type: "bot",
      message_type: "text",
      body: aviso,
      metadata: { source: "passagem_consultoria", account_id: contaAtual.id },
      status: "sending",
    })
    .select("id")
    .single();
  const envioAviso = await getProvider(contaAtual.provider).sendMessage({
    account: contaAtual,
    to: telefone,
    type: "text",
    body: aviso,
  });
  await admin
    .from("whatsapp_messages")
    .update({
      provider_message_id: envioAviso.providerMessageId || null,
      status: envioAviso.status === "failed" ? "failed" : "sent",
      error: envioAviso.error ?? null,
      sent_at: agora(),
    })
    .eq("id", msgAviso?.id ?? "00000000-0000-0000-0000-000000000000");

  // 2) A dona nova se apresenta pelo número dela.
  const { headerParams, bodyParams, headerMedia, erro } = await resolveTemplateSendParams({
    account: {
      access_token: destino.access_token ?? "",
      provider_base_url: destino.provider_base_url,
    },
    metaTemplateId: noDestino.metaTemplateId,
    storedVariables: tmpl.variables,
    headerMediaUrl: tmpl.header_media_url,
    lead: { name: lead?.name, company_name: lead?.company_name },
    responsavel: nomeDaDona,
  });
  const corpo = (tmpl.body ?? "")
    .replace(/\{\{\s*primeiro_nome\s*\}\}/g, primeiroNome(lead?.name))
    .replace(/\{\{\s*(sdr|responsavel)\s*\}\}/g, primeiroNome(nomeDaDona));
  const { data: msgApresentacao } = await admin
    .from("whatsapp_messages")
    .insert({
      conversation_id: conversaId,
      lead_id: leadId,
      sender_type: "bot",
      message_type: "template",
      body: corpo || null,
      metadata: {
        source: "passagem_consultoria",
        template_id: tmpl.id,
        template_name: tmpl.provider_template_name,
        account_id: destino.id,
      },
      status: "sending",
    })
    .select("id")
    .single();
  const envio = erro
    ? { providerMessageId: "", status: "failed" as const, error: erro }
    : await getProvider(destino.provider).sendMessage({
        account: {
          id: destino.id,
          phone_number: destino.phone_number,
          provider: destino.provider,
          provider_instance_id: destino.provider_instance_id,
          provider_base_url: destino.provider_base_url,
          access_token: destino.access_token,
          webhook_secret: destino.webhook_secret,
        },
        to: telefone,
        type: "template",
        templateName: tmpl.provider_template_name,
        templateLanguage: tmpl.language ?? "pt_BR",
        templateHeaderParams: headerParams,
        templateHeaderMedia: headerMedia,
        templateParams: bodyParams,
      });
  await admin
    .from("whatsapp_messages")
    .update({
      provider_message_id: envio.providerMessageId || null,
      status: envio.status === "failed" ? "failed" : "sent",
      error: envio.error ?? null,
      sent_at: agora(),
    })
    .eq("id", msgApresentacao?.id ?? "00000000-0000-0000-0000-000000000000");

  /*
   * 3) A conversa segue pelo número da dona.
   *
   * Se a apresentação falhou, o lead já foi avisado: a conversa fica com a
   * dona, pendente, para ela chamar à mão — a promessa do aviso precisa ser
   * cumprida por alguém.
   */
  const passou = envio.status !== "failed";
  await admin
    .from("whatsapp_conversations")
    .update({
      ...(passou ? { account_id: destino.id } : {}),
      assigned_user_id: donaId,
      status: passou ? "open" : "pending",
      last_message_at: agora(),
      last_preview: (passou ? corpo : aviso).slice(0, 200),
    })
    .eq("id", conversaId);
  await admin.from("lead_interactions").insert({
    lead_id: leadId,
    author_id: null,
    type: "routing",
    content: passou
      ? `Conversa passada para o WhatsApp de ${primeiroNome(nomeDaDona) || "consultoria"}, com aviso ao lead.`
      : `Lead avisado da passagem, mas a apresentação pelo WhatsApp de ${primeiroNome(nomeDaDona) || "consultoria"} falhou (${envio.error ?? "erro"}). Chame o lead à mão.`,
    metadata: {
      mode: "passagem_consultoria",
      from_account_id: contaAtual.id,
      to_account_id: destino.id,
      assignee_user_id: donaId,
      ok: passou,
    },
  });
  return passou ? "passou" : "falhou";
}
