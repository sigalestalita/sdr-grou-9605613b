import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { planejarJornada, quandoPorExtenso, type PassoDaJornada } from "./jornada-agenda";

/*
 * Envio da jornada da agenda (ver jornada-agenda.ts).
 *
 * Roda junto com a rotina de automações do WhatsApp, a cada 2 minutos. Não
 * guarda um plano: a cada rodada recalcula a jornada de cada reunião futura a
 * partir de leads.meeting_at e meeting_booked_at (carimbado pelo banco sempre
 * que a reunião muda). Reagendou, a jornada é outra; cancelou, não há jornada.
 *
 * Cada passo sai uma vez por reunião: a linha em sdr_jornada_envios
 * (lead, passo, reunião) é gravada antes do envio — duas rodadas seguidas não
 * mandam a mesma mensagem.
 */

export const CHAVE_JORNADA = "sdr_jornada_agenda";

export type ConfigJornada = {
  ativo: boolean;
  /** Só reuniões marcadas a partir daqui: ligar a jornada não dispara nada atrasado. */
  desde: string | null;
  /** id do template (whatsapp_templates) de cada passo; passo sem template não sai. */
  templates: Partial<Record<PassoDaJornada, string>>;
  /** Link do material dos passos 2 e 3 (variável {{material}}). */
  material_url: string;
  /** Conta de onde sai quando a SDR não tem número próprio conectado. */
  account_id: string | null;
  /** Atualiza as datas da reunião no negócio do RD (transição). */
  rd_atualizar: boolean;
};

const PADRAO: ConfigJornada = {
  ativo: false,
  desde: null,
  templates: {},
  material_url: "",
  account_id: null,
  rd_atualizar: false,
};

export async function getConfigJornada(): Promise<ConfigJornada> {
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", CHAVE_JORNADA)
    .maybeSingle();
  return { ...PADRAO, ...((data?.value ?? {}) as Partial<ConfigJornada>) };
}

type LeadDaAgenda = {
  id: string;
  name: string | null;
  company_name: string | null;
  phone: string | null;
  lead_type: string | null;
  assigned_to: string | null;
  probable_pain: string | null;
  meeting_at: string;
  meeting_booked_at: string | null;
  rd_deal_id: string | null;
  stage_id: string | null;
};

// Lead que saiu do caminho da reunião não recebe a jornada.
const ETAPAS_FORA = ["desqualificado", "no_show"];

export async function processarJornadaDaAgenda(agora = new Date()) {
  const cfg = await getConfigJornada();
  if (!cfg.ativo && !cfg.rd_atualizar) return { reunioes: 0, enviados: 0, falhas: 0, rd: 0 };

  const { data: etapas } = await supabaseAdmin.from("stages").select("id").in("slug", ETAPAS_FORA);
  const fora = new Set((etapas ?? []).map((e) => e.id as string));

  let q = supabaseAdmin
    .from("leads")
    .select(
      "id, name, company_name, phone, lead_type, assigned_to, probable_pain, meeting_at, meeting_booked_at, rd_deal_id, stage_id",
    )
    .gt("meeting_at", agora.toISOString())
    .lt("meeting_at", new Date(agora.getTime() + 15 * 86400_000).toISOString())
    .not("meeting_booked_at", "is", null)
    .limit(500);
  if (cfg.desde) q = q.gte("meeting_booked_at", cfg.desde);
  const { data } = await q;
  const leads = ((data ?? []) as LeadDaAgenda[]).filter((l) => !fora.has(l.stage_id ?? ""));

  let enviados = 0;
  let falhas = 0;
  let rd = 0;
  for (const lead of leads) {
    const reuniaoEm = new Date(lead.meeting_at);
    if (cfg.rd_atualizar && lead.rd_deal_id && (await reservar(lead.id, "rd", lead.meeting_at))) {
      const r = await atualizarAgendaNoRd(lead, reuniaoEm);
      await concluir(lead.id, "rd", lead.meeting_at, r.ok, r.error, null);
      if (r.ok) rd++;
    }
    if (!cfg.ativo || !lead.phone) continue;

    const plano = planejarJornada({ agendadoEm: new Date(lead.meeting_booked_at!), reuniaoEm });
    for (const p of plano) {
      if (p.enviarEm > agora || p.validoAte <= agora) continue;
      const templateId = cfg.templates[p.passo];
      if (!templateId) continue;
      if (!(await reservar(lead.id, p.passo, lead.meeting_at))) continue;
      const r = await enviarPasso(lead, templateId, cfg, {
        ...quandoPorExtenso(reuniaoEm),
        material: cfg.material_url,
        saudacao: saudacaoAgora(agora),
        dor: (lead.probable_pain ?? "").trim(),
      });
      await concluir(lead.id, p.passo, lead.meeting_at, r.ok, r.error, r.messageId);
      if (r.ok) enviados++;
      else falhas++;
    }
  }
  return { reunioes: leads.length, enviados, falhas, rd };
}

function saudacaoAgora(agora: Date) {
  const hora = +new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(agora);
  return hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
}

/** Grava o passo antes de enviar; false se outra rodada já gravou. */
async function reservar(leadId: string, passo: string, reuniaoEm: string) {
  const { data } = await supabaseAdmin
    .from("sdr_jornada_envios" as never)
    .upsert({ lead_id: leadId, passo, reuniao_em: reuniaoEm, status: "enviando" } as never, {
      onConflict: "lead_id,passo,reuniao_em",
      ignoreDuplicates: true,
    })
    .select("id");
  return ((data ?? []) as unknown[]).length > 0;
}

async function concluir(
  leadId: string,
  passo: string,
  reuniaoEm: string,
  ok: boolean,
  erro: string | undefined,
  messageId: string | null,
) {
  await supabaseAdmin
    .from("sdr_jornada_envios" as never)
    .update({
      status: ok ? "enviado" : "falhou",
      erro: erro ?? null,
      message_id: messageId,
      enviado_em: new Date().toISOString(),
    } as never)
    .eq("lead_id", leadId)
    .eq("passo", passo)
    .eq("reuniao_em", reuniaoEm);
}

async function enviarPasso(
  lead: LeadDaAgenda,
  templateId: string,
  cfg: ConfigJornada,
  extras: Record<string, string>,
): Promise<{ ok: boolean; error?: string; messageId: string | null }> {
  const { data: tmpl } = await supabaseAdmin
    .from("whatsapp_templates")
    .select("*")
    .eq("id", templateId)
    .maybeSingle();
  if (!tmpl?.provider_template_name || tmpl.status !== "approved")
    return { ok: false, error: "Template da jornada inexistente ou não aprovado", messageId: null };

  const { contaParaOLead } = await import("@/lib/whatsapp/conta-da-dona.server");
  const { templateNaConta } = await import("@/lib/whatsapp/templates-por-waba.server");
  const { resolveTemplateSendParams } = await import("@/lib/whatsapp/template-send.server");
  const { garantirContato } = await import("@/lib/whatsapp/automations-engine.server");
  const { getProvider } = await import("@/lib/whatsapp/provider-registry.server");
  const { renderTemplate } = await import("@/lib/whatsapp-templates.functions");

  // Do número da SDR, se o template já está aprovado lá; senão, da conta da jornada.
  const contaDaSdr = await contaParaOLead(supabaseAdmin, lead.id, lead.assigned_to);
  const naConta = contaDaSdr ? await templateNaConta(supabaseAdmin, contaDaSdr, tmpl) : null;
  const conta =
    (naConta ? contaDaSdr : null) ??
    (cfg.account_id
      ? (
          await supabaseAdmin
            .from("whatsapp_accounts")
            .select("*")
            .eq("id", cfg.account_id)
            .maybeSingle()
        ).data
      : null) ??
    (await supabaseAdmin.from("whatsapp_accounts").select("*").eq("is_default", true).maybeSingle())
      .data;
  if (!conta) return { ok: false, error: "Sem conta WhatsApp", messageId: null };

  const { data: sdr } = lead.assigned_to
    ? await supabaseAdmin
        .from("profiles")
        .select("full_name")
        .eq("id", lead.assigned_to)
        .maybeSingle()
    : { data: null };
  const assinatura = (sdr?.full_name ?? "").trim().split(/\s+/)[0] || "Equipe Grou";

  const contactId = await garantirContato(lead);
  let convId: string | null = null;
  const { data: existe } = await supabaseAdmin
    .from("whatsapp_conversations")
    .select("id")
    .eq("lead_id", lead.id)
    .maybeSingle();
  if (existe) convId = existe.id;
  else {
    const { data: nova } = await supabaseAdmin
      .from("whatsapp_conversations")
      .insert({
        lead_id: lead.id,
        contact_id: contactId,
        account_id: conta.id,
        assigned_user_id: lead.assigned_to,
        status: "open",
      })
      .select("id")
      .single();
    convId = nova?.id ?? null;
  }
  if (!convId) return { ok: false, error: "Falha criando conversa", messageId: null };

  const { headerParams, bodyParams, headerMedia, erro } = await resolveTemplateSendParams({
    account: { access_token: conta.access_token ?? "", provider_base_url: conta.provider_base_url },
    metaTemplateId:
      naConta && conta === contaDaSdr ? naConta.metaTemplateId : tmpl.meta_template_id,
    storedVariables: tmpl.variables,
    headerMediaUrl: (tmpl as { header_media_url?: string | null }).header_media_url ?? null,
    lead: { name: lead.name, company_name: lead.company_name },
    responsavel: assinatura,
    extras,
  });
  if (erro) return { ok: false, error: erro, messageId: null };

  const primeiro = (lead.name ?? "").trim().split(/\s+/)[0] ?? "";
  const texto = renderTemplate(tmpl.body ?? "", {
    nome: lead.name ?? "",
    primeiro_nome: primeiro,
    empresa: lead.company_name ?? "",
    sdr: assinatura,
    responsavel: assinatura,
    ...extras,
  }).trim();

  const { data: msg } = await supabaseAdmin
    .from("whatsapp_messages")
    .insert({
      conversation_id: convId,
      lead_id: lead.id,
      sender_type: "bot",
      message_type: "template",
      body: texto || null,
      metadata: {
        source: "jornada_agenda",
        template_id: templateId,
        template_name: tmpl.provider_template_name,
        account_id: conta.id,
      },
      status: "sending",
    })
    .select("id")
    .single();

  try {
    const r = await getProvider(conta.provider).sendMessage({
      account: {
        id: conta.id,
        phone_number: conta.phone_number,
        provider: conta.provider,
        provider_instance_id: conta.provider_instance_id,
        provider_base_url: conta.provider_base_url,
        access_token: conta.access_token,
        webhook_secret: conta.webhook_secret,
      },
      to: (lead.phone ?? "").replace(/\D+/g, ""),
      type: "template",
      templateName: tmpl.provider_template_name,
      templateLanguage: tmpl.language ?? "pt_BR",
      templateHeaderParams: headerParams,
      templateHeaderMedia: headerMedia,
      templateParams: bodyParams,
    });
    if (msg?.id)
      await supabaseAdmin
        .from("whatsapp_messages")
        .update({
          provider_message_id: r.providerMessageId,
          status: r.status === "failed" ? "failed" : "sent",
          error: r.error ?? null,
          sent_at: new Date().toISOString(),
        })
        .eq("id", msg.id);
    await supabaseAdmin
      .from("whatsapp_conversations")
      .update({
        last_message_at: new Date().toISOString(),
        last_preview: texto.slice(0, 200) || `[HSM] ${tmpl.provider_template_name}`,
      })
      .eq("id", convId);
    return { ok: r.status !== "failed", error: r.error, messageId: msg?.id ?? null };
  } catch (e) {
    const m = e instanceof Error ? e.message : "Falha";
    if (msg?.id)
      await supabaseAdmin
        .from("whatsapp_messages")
        .update({ status: "failed", error: m })
        .eq("id", msg.id);
    return { ok: false, error: m, messageId: msg?.id ?? null };
  }
}

/*
 * Transição: a reunião é marcada no Compass, mas os relatórios e as
 * automações do comercial ainda leem o RD. Grava só as duas datas do
 * negócio de SDR — etapa e "Status da reunião" disparam fluxos no RD
 * (ex.: "Reagendada" move o negócio para o comercial) e seguem com a SDR.
 */
const CAMPO_DATA_REUNIAO = "69171a15cdfb180013aa393e";
const CAMPO_DATA_AGENDAMENTO = "691723e01269290018cc9936";

async function atualizarAgendaNoRd(lead: LeadDaAgenda, reuniaoEm: Date) {
  const { getRdTokenInfo } = await import("@/lib/rd-token.server");
  const { token } = await getRdTokenInfo();
  if (!token) return { ok: false, error: "RD não conectado" };
  const dataBr = (d: Date) =>
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(d);
  const res = await fetch(
    `https://crm.rdstation.com/api/v1/deals/${encodeURIComponent(lead.rd_deal_id!)}?token=${encodeURIComponent(token)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        deal: {
          deal_custom_fields: [
            { custom_field_id: CAMPO_DATA_REUNIAO, value: dataBr(reuniaoEm) },
            {
              custom_field_id: CAMPO_DATA_AGENDAMENTO,
              value: dataBr(new Date(lead.meeting_booked_at ?? Date.now())),
            },
          ],
        },
      }),
    },
  );
  if (!res.ok) return { ok: false, error: `RD ${res.status}: ${(await res.text()).slice(0, 200)}` };
  return { ok: true as const };
}
