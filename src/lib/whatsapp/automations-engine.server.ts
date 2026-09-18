import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getProvider } from "./provider-registry.server";
import { resolveTemplateSendParams } from "./template-send.server";
import { phoneDigits } from "./phone";
import { renderTemplate } from "../whatsapp-templates.functions";

type AiAgentSettings = {
  enabled: boolean;
  initialOutreachEnabled: boolean;
  initialTemplateId: string | null;
  defaultAccountId: string | null;
  consultoriaAccountId: string | null;
  consultoriaInitialTemplateId: string | null;
  /** Nome que assina quando o lead ainda não tem SDR responsável. */
  assinaturaFallback: string;
};

type RuleRow = {
  id: string;
  name: string;
  trigger_type: string;
  trigger_config: Record<string, unknown> | null;
  template_id: string | null;
  delay_minutes: number | null;
  active: boolean;
  account_id: string | null;
};

type LeadLite = {
  id: string;
  name: string | null;
  company_name: string | null;
  phone: string | null;
  priority: string | null;
  lead_type: string | null;
  assigned_to: string | null;
  stage_id: string | null;
  created_at: string;
  meeting_at: string | null;
};

function passesCommonFilters(lead: LeadLite, cfg: Record<string, unknown> | null): boolean {
  if (!cfg) return true;
  const priorities = (cfg.priorities as string[] | undefined) ?? [];
  if (priorities.length && (!lead.priority || !priorities.includes(lead.priority))) return false;
  const leadType = (cfg.leadType as string[] | undefined) ?? [];
  if (leadType.length && (!lead.lead_type || !leadType.includes(lead.lead_type))) return false;
  return true;
}

async function alreadyExecuted(ruleId: string, leadId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("whatsapp_automation_logs")
    .select("id")
    .eq("rule_id", ruleId)
    .eq("lead_id", leadId)
    .eq("status", "sent")
    .limit(1)
    .maybeSingle();
  return !!data;
}

async function getDefaultAccount() {
  const { data } = await supabaseAdmin
    .from("whatsapp_accounts")
    .select("*")
    .eq("is_default", true)
    .maybeSingle();
  return data;
}

async function getAccountById(id: string | null | undefined) {
  if (!id) return null;
  const { data } = await supabaseAdmin
    .from("whatsapp_accounts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data;
}

function accountAllowsLead(
  account: { lead_type_scope: string[] | null } | null,
  leadType: string | null,
): boolean {
  if (!account) return true;
  const scope = account.lead_type_scope;
  if (!scope || scope.length === 0) return true;
  return !!leadType && scope.includes(leadType);
}

async function getAiAgentSettings(): Promise<AiAgentSettings> {
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", "whatsapp_ai_agent")
    .maybeSingle();
  const value = (data?.value ?? {}) as Record<string, unknown>;
  return {
    enabled: value.enabled === true,
    initialOutreachEnabled: value.initialOutreachEnabled === true,
    initialTemplateId: typeof value.initialTemplateId === "string" ? value.initialTemplateId : null,
    defaultAccountId: typeof value.defaultAccountId === "string" ? value.defaultAccountId : null,
    consultoriaAccountId:
      typeof value.consultoriaAccountId === "string" ? value.consultoriaAccountId : null,
    consultoriaInitialTemplateId:
      typeof value.consultoriaInitialTemplateId === "string"
        ? value.consultoriaInitialTemplateId
        : null,
    assinaturaFallback:
      typeof value.assinaturaFallback === "string" && value.assinaturaFallback.trim()
        ? value.assinaturaFallback
        : "Equipe Grou",
  };
}

async function executeRuleForLead(
  rule: RuleRow,
  lead: LeadLite,
): Promise<{ ok: boolean; error?: string }> {
  if (!lead.phone) return { ok: false, error: "Lead sem telefone" };
  if (!rule.template_id) return { ok: false, error: "Sem template" };

  const { data: tmpl } = await supabaseAdmin
    .from("whatsapp_templates")
    .select("body")
    .eq("id", rule.template_id)
    .maybeSingle();
  if (!tmpl) return { ok: false, error: "Template inexistente" };

  const account = (await getAccountById(rule.account_id)) ?? (await getDefaultAccount());
  if (!account) return { ok: false, error: "Sem conta WhatsApp padrão" };
  if (!accountAllowsLead(account, lead.lead_type)) {
    return { ok: false, error: "Lead fora do escopo da conta WhatsApp da regra" };
  }

  const body = renderTemplate(tmpl.body, {
    nome: lead.name ?? "",
    primeiro_nome: (lead.name ?? "").split(" ")[0] ?? "",
    empresa: lead.company_name ?? "",
  });

  /*
   * Garante o contato antes da conversa.
   *
   * A automação abria a conversa sem contato nenhum, e era por contato que o
   * webhook achava o lead quando a pessoa respondia. Sem essa linha, a
   * resposta chegava órfã e virava um lead novo.
   */
  const { phoneDigits } = await import("./phone");
  const telefone = phoneDigits(lead.phone);
  let contactId: string | null = null;
  if (telefone) {
    const { data: jaExiste } = await supabaseAdmin
      .from("whatsapp_contacts")
      .select("id, lead_id")
      .eq("phone", telefone)
      .maybeSingle();
    if (jaExiste) {
      contactId = jaExiste.id;
      // Só adota o contato órfão; um que já é de outro lead não muda de dono.
      if (!jaExiste.lead_id) {
        await supabaseAdmin
          .from("whatsapp_contacts")
          .update({ lead_id: lead.id })
          .eq("id", jaExiste.id);
      }
    } else {
      const { data: novo } = await supabaseAdmin
        .from("whatsapp_contacts")
        .insert({ phone: telefone, lead_id: lead.id, name: lead.name })
        .select("id")
        .maybeSingle();
      contactId = novo?.id ?? null;
    }
  }

  // garante conversa
  let convId: string | null = null;
  const { data: existing } = await supabaseAdmin
    .from("whatsapp_conversations")
    .select("id, contact_id")
    .eq("lead_id", lead.id)
    .maybeSingle();
  if (existing) {
    convId = existing.id;
    if (!existing.contact_id && contactId) {
      await supabaseAdmin
        .from("whatsapp_conversations")
        .update({ contact_id: contactId })
        .eq("id", convId);
    }
  } else {
    const { data: created } = await supabaseAdmin
      .from("whatsapp_conversations")
      .insert({
        lead_id: lead.id,
        contact_id: contactId,
        account_id: account.id,
        assigned_user_id: lead.assigned_to,
        status: "open",
      })
      .select("id")
      .single();
    convId = created?.id ?? null;
  }
  if (!convId) return { ok: false, error: "Falha criando conversa" };

  const { data: msg } = await supabaseAdmin
    .from("whatsapp_messages")
    .insert({
      conversation_id: convId,
      lead_id: lead.id,
      sender_type: "automation",
      message_type: "text",
      body,
      status: "sending",
    })
    .select("id")
    .single();

  try {
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
      to: lead.phone.replace(/\D+/g, ""),
      type: "text",
      body,
    });
    if (msg?.id) {
      await supabaseAdmin
        .from("whatsapp_messages")
        .update({
          provider_message_id: result.providerMessageId,
          status: result.status === "failed" ? "failed" : "sent",
          error: result.error ?? null,
          sent_at: new Date().toISOString(),
        })
        .eq("id", msg.id);
    }
    await supabaseAdmin
      .from("whatsapp_conversations")
      .update({
        last_message_at: new Date().toISOString(),
        last_preview: body.slice(0, 200),
        status: "open",
      })
      .eq("id", convId);
    await supabaseAdmin.from("whatsapp_automation_logs").insert({
      rule_id: rule.id,
      lead_id: lead.id,
      message_id: msg?.id ?? null,
      status: result.status === "failed" ? "failed" : "sent",
      error: result.error ?? null,
      executed_at: new Date().toISOString(),
    });
    return { ok: result.status !== "failed", error: result.error };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha";
    if (msg?.id) {
      await supabaseAdmin
        .from("whatsapp_messages")
        .update({ status: "failed", error: message })
        .eq("id", msg.id);
    }
    await supabaseAdmin.from("whatsapp_automation_logs").insert({
      rule_id: rule.id,
      lead_id: lead.id,
      message_id: msg?.id ?? null,
      status: "failed",
      error: message,
      executed_at: new Date().toISOString(),
    });
    return { ok: false, error: message };
  }
}

/**
 * Garante o contato do WhatsApp do lead.
 *
 * É por contato que o webhook acha o lead quando a pessoa responde. Sem isso a
 * resposta chega órfã e vira um lead novo — foi o que aconteceu com o lead da
 * ELOS DH.
 */
async function garantirContato(lead: LeadLite): Promise<string | null> {
  const telefone = phoneDigits(lead.phone);
  if (!telefone) return null;

  const { data: jaExiste } = await supabaseAdmin
    .from("whatsapp_contacts")
    .select("id, lead_id")
    .eq("phone", telefone)
    .maybeSingle();
  if (jaExiste) {
    // Só adota o contato órfão; um que já é de outro lead não muda de dono.
    if (!jaExiste.lead_id) {
      await supabaseAdmin
        .from("whatsapp_contacts")
        .update({ lead_id: lead.id })
        .eq("id", jaExiste.id);
    }
    return jaExiste.id;
  }
  const { data: novo } = await supabaseAdmin
    .from("whatsapp_contacts")
    .insert({ phone: telefone, lead_id: lead.id, name: lead.name })
    .select("id")
    .maybeSingle();
  return novo?.id ?? null;
}

/**
 * Move o lead de etapa quando o atendimento avança.
 *
 * Só avança: se o lead já passou de "Em qualificação", receber a mensagem
 * automática não pode puxá-lo de volta.
 */
export async function moverEtapaDoLead(leadId: string, slug: "qualificacao" | "em_contato") {
  const { data: stages } = await supabaseAdmin.from("stages").select("id, slug, position");
  const destino = (stages ?? []).find((s) => s.slug === slug);
  if (!destino) return;

  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("stage_id, first_approach_at")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return;
  if (lead.stage_id === destino.id) return;

  const atual = (stages ?? []).find((s) => s.id === lead.stage_id);
  if (atual && Number(atual.position ?? 0) > Number(destino.position ?? 0)) return;

  const patch: Record<string, unknown> = {
    stage_id: destino.id,
    stage_entered_at: new Date().toISOString(),
    last_action_at: new Date().toISOString(),
  };
  // "Em contato" é o marco de primeira abordagem humana, como no kanban.
  if (slug === "em_contato" && !lead.first_approach_at) {
    patch.first_approach_at = new Date().toISOString();
  }
  await supabaseAdmin
    .from("leads")
    .update(patch as never)
    .eq("id", leadId);
}

async function executeAiInitialOutreachForLead(
  lead: LeadLite,
): Promise<{ ok: boolean; error?: string }> {
  if (!lead.phone) return { ok: false, error: "Lead sem telefone" };
  const settings = await getAiAgentSettings();
  if (!settings.enabled || !settings.initialOutreachEnabled) {
    return { ok: false, error: "IA inicial desativada ou sem template HSM" };
  }

  const isConsultoria = lead.lead_type === "consultoria";
  const templateId =
    (isConsultoria && settings.consultoriaInitialTemplateId) || settings.initialTemplateId;
  if (!templateId) return { ok: false, error: "IA inicial sem template HSM configurado" };

  const { data: tmpl } = await supabaseAdmin
    .from("whatsapp_templates")
    // "*" porque valido_ate entra na migration da campanha de setembro; os
    // tipos gerados só conhecem a coluna depois que ela roda.
    .select("*")
    .eq("id", templateId)
    .maybeSingle();
  if (!tmpl?.provider_template_name) return { ok: false, error: "Template HSM inicial inválido" };

  /*
   * Template de campanha vencido não sai.
   *
   * O corpo aprovado na Meta é fixo: um que diz "até 30 de setembro"
   * continuaria prometendo em outubro uma condição encerrada. É a mesma
   * armadilha da oferta em texto livre, do outro lado. Vencido, o disparo
   * simplesmente não acontece — melhor calar do que prometer o que não existe.
   */
  const validade = (tmpl as { valido_ate?: string | null }).valido_ate ?? null;
  if (validade) {
    const hoje = new Date();
    const fim = new Date(`${validade}T23:59:59`);
    if (Number.isFinite(fim.getTime()) && fim.getTime() < hoje.getTime()) {
      return {
        ok: false,
        error: `Template "${tmpl.provider_template_name}" venceu em ${validade}. Aponte a IA para um template sem campanha em Inbox → IA.`,
      };
    }
  }

  /*
   * Quem assina a primeira mensagem é o SDR responsável pelo lead.
   *
   * A mensagem antiga dizia "em breve um especialista da nossa equipe vai
   * falar com você", e isso não descrevia o que acontece: quando o lead
   * responde, quem atende é esse mesmo SDR, por esse mesmo número. A promessa
   * de um segundo contato que nunca vem só atrapalha a conversa.
   */
  const { assinaturaDaIa } = await import("./ai-elegibilidade");

  /*
   * Sem dono não dá para assinar.
   *
   * A mensagem diz "aqui é Fulana, da Grou" e promete que essa pessoa segue o
   * atendimento. Saindo como "Equipe", a promessa fica vaga e quem responder
   * cai na fila geral. Distribuir antes de escrever resolve as duas coisas —
   * e para consultoria já existe dona definida.
   */
  let responsavelId = lead.assigned_to;
  if (!responsavelId) {
    try {
      const { ensureLeadRouted } = await import("../lead-routing.server");
      responsavelId = await ensureLeadRouted({ supabase: supabaseAdmin, leadId: lead.id });
    } catch {
      /* distribuir é melhor-esforço: sem dono, a assinatura cai no genérico */
    }
  }

  let nomeDoSdr: string | null = null;
  if (responsavelId) {
    const { data: perfil } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email")
      .eq("id", responsavelId)
      .maybeSingle();
    nomeDoSdr = perfil?.full_name || perfil?.email || null;
  }
  const assinatura = assinaturaDaIa(nomeDoSdr, settings.assinaturaFallback);

  const renderedBody = renderTemplate(tmpl.body ?? "", {
    nome: lead.name ?? "",
    primeiro_nome: (lead.name ?? "").split(" ")[0] ?? "",
    empresa: lead.company_name ?? "",
    sdr: assinatura,
    responsavel: assinatura,
  }).trim();

  const preferredAccountId = isConsultoria
    ? settings.consultoriaAccountId
    : settings.defaultAccountId;
  const account = (await getAccountById(preferredAccountId)) ?? (await getDefaultAccount());
  if (!account) return { ok: false, error: "Sem conta WhatsApp configurada" };
  if (!accountAllowsLead(account, lead.lead_type)) {
    return { ok: false, error: "Conta WhatsApp não permite este tipo de lead" };
  }

  const contactId = await garantirContato(lead);

  let convId: string | null = null;
  const { data: existing } = await supabaseAdmin
    .from("whatsapp_conversations")
    .select("id, contact_id")
    .eq("lead_id", lead.id)
    .maybeSingle();
  if (existing) {
    convId = existing.id;
    if (!existing.contact_id && contactId) {
      await supabaseAdmin
        .from("whatsapp_conversations")
        .update({ contact_id: contactId })
        .eq("id", convId);
    }
  } else {
    const { data: created } = await supabaseAdmin
      .from("whatsapp_conversations")
      .insert({
        lead_id: lead.id,
        contact_id: contactId,
        account_id: account.id,
        // O mesmo dono que assinou a mensagem: quem responder cai na fila dela.
        assigned_user_id: responsavelId,
        status: "open",
      })
      .select("id")
      .single();
    convId = created?.id ?? null;
  }
  if (!convId) return { ok: false, error: "Falha criando conversa" };

  const { headerParams, bodyParams } = await resolveTemplateSendParams({
    account: {
      access_token: account.access_token ?? "",
      provider_base_url: account.provider_base_url,
    },
    metaTemplateId: tmpl.meta_template_id,
    storedVariables: tmpl.variables,
    lead: {
      name: lead.name,
      company_name: lead.company_name,
    },
    responsavel: assinatura,
  });

  const { data: msg } = await supabaseAdmin
    .from("whatsapp_messages")
    .insert({
      conversation_id: convId,
      lead_id: lead.id,
      sender_type: "bot",
      message_type: "template",
      body: renderedBody || null,
      metadata: {
        source: "ai_initial_outreach",
        template_id: templateId,
        template_name: tmpl.provider_template_name,
        rendered_body: renderedBody || null,
        account_id: account.id,
      },
      status: "sending",
    })
    .select("id")
    .single();

  try {
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
      to: lead.phone.replace(/\D+/g, ""),
      type: "template",
      templateName: tmpl.provider_template_name,
      templateLanguage: tmpl.language ?? "pt_BR",
      templateHeaderParams: headerParams,
      templateParams: bodyParams,
    });

    if (msg?.id) {
      await supabaseAdmin
        .from("whatsapp_messages")
        .update({
          provider_message_id: result.providerMessageId,
          status: result.status === "failed" ? "failed" : "sent",
          error: result.error ?? null,
          sent_at: new Date().toISOString(),
        })
        .eq("id", msg.id);
    }

    await supabaseAdmin
      .from("whatsapp_conversations")
      .update({
        last_message_at: new Date().toISOString(),
        last_preview: renderedBody || `[HSM] ${tmpl.provider_template_name}`,
        status: "open",
      })
      .eq("id", convId);

    /*
     * Recebida a primeira mensagem, o lead deixa de ser "Novo": o atendimento
     * começou. Vai para "Em qualificação" e só sai de lá na passada de bastão,
     * quando vira "Em contato".
     */
    if (result.status !== "failed") {
      await moverEtapaDoLead(lead.id, "qualificacao");
    }

    return { ok: result.status !== "failed", error: result.error };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha";
    if (msg?.id) {
      await supabaseAdmin
        .from("whatsapp_messages")
        .update({ status: "failed", error: message })
        .eq("id", msg.id);
    }
    return { ok: false, error: message };
  }
}

async function evalNewLead(rule: RuleRow): Promise<LeadLite[]> {
  // Leads criados nas últimas 24h ainda não processados; o dedupe via logs cobre o resto.
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from("leads")
    .select(
      "id,name,company_name,phone,priority,lead_type,assigned_to,stage_id,created_at,meeting_at",
    )
    .eq("oculto_sdr", false) // leads do RD ficam fora até a migração
    .gte("created_at", since)
    .not("phone", "is", null)
    .limit(500);
  const delay = rule.delay_minutes ?? 0;
  const cutoff = Date.now() - delay * 60_000;
  const candidatos = (data ?? []).filter(
    (l) =>
      passesCommonFilters(l, rule.trigger_config) && new Date(l.created_at).getTime() <= cutoff,
  );

  /*
   * Quem já escreveu não recebe abertura.
   *
   * O lead que vem do clique no anúncio do WhatsApp chega com a conversa já
   * começada, e a IA costuma responder antes desta automação rodar. Mandar o
   * template de primeiro contato em cima disso faz a Grou se apresentar duas
   * vezes, e ainda por cima depois de já ter conversado.
   */
  const jaEscreveram = await leadsComMensagemDoLead(candidatos.map((l) => l.id));
  return candidatos.filter((l) => !jaEscreveram.has(l.id));
}

/** Os leads da lista cuja conversa já tem mensagem escrita pela própria pessoa. */
async function leadsComMensagemDoLead(leadIds: string[]): Promise<Set<string>> {
  const comMensagem = new Set<string>();
  if (leadIds.length === 0) return comMensagem;
  const { data: convs } = await supabaseAdmin
    .from("whatsapp_conversations")
    .select("id, lead_id")
    .in("lead_id", leadIds);
  const donoDaConversa = new Map<string, string>();
  for (const c of (convs ?? []) as Array<{ id: string; lead_id: string | null }>) {
    if (c.lead_id) donoDaConversa.set(c.id, c.lead_id);
  }
  if (donoDaConversa.size === 0) return comMensagem;
  const { data: msgs } = await supabaseAdmin
    .from("whatsapp_messages")
    .select("conversation_id, sender_type")
    .in("conversation_id", [...donoDaConversa.keys()])
    .eq("sender_type", "lead");
  return cruzarMensagensComLeads(donoDaConversa, (msgs ?? []) as MensagemLite[]);
}

export type MensagemLite = { conversation_id: string; sender_type?: string | null };

/** A parte testável: de quem são as mensagens escritas pelo próprio lead. */
export function cruzarMensagensComLeads(
  donoDaConversa: Map<string, string>,
  mensagens: MensagemLite[],
): Set<string> {
  const comMensagem = new Set<string>();
  for (const m of mensagens) {
    if (m.sender_type && m.sender_type !== "lead") continue;
    const leadId = donoDaConversa.get(m.conversation_id);
    if (leadId) comMensagem.add(leadId);
  }
  return comMensagem;
}

async function evalStageChange(rule: RuleRow): Promise<LeadLite[]> {
  const cfg = rule.trigger_config ?? {};
  const stageId = cfg.stageId as string | undefined;
  if (!stageId) return [];
  // Usa stage_entered_at; aplica delay
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from("leads")
    .select(
      "id,name,company_name,phone,priority,lead_type,assigned_to,stage_id,created_at,meeting_at,stage_entered_at",
    )
    .eq("stage_id", stageId)
    .gte("stage_entered_at", since)
    .not("phone", "is", null)
    .limit(500);
  const delay = rule.delay_minutes ?? 0;
  const cutoff = Date.now() - delay * 60_000;
  return (data ?? []).filter((l) => {
    if (!passesCommonFilters(l, rule.trigger_config)) return false;
    const t = (l as { stage_entered_at: string | null }).stage_entered_at;
    if (!t) return false;
    return new Date(t).getTime() <= cutoff;
  });
}

async function evalNoReply(rule: RuleRow): Promise<LeadLite[]> {
  const cfg = rule.trigger_config ?? {};
  const hours = (cfg.hoursWithoutReply as number | undefined) ?? 24;
  const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  // Conversas abertas, última mensagem (do SDR) antes do cutoff e sem inbound mais recente
  const { data: convs } = await supabaseAdmin
    .from("whatsapp_conversations")
    .select(
      "id, lead_id, last_message_at, status, leads:lead_id(id,name,company_name,phone,priority,lead_type,assigned_to,stage_id,created_at,meeting_at)",
    )
    .eq("status", "open")
    .lt("last_message_at", cutoff)
    .limit(500);
  const leads: LeadLite[] = [];
  for (const c of convs ?? []) {
    const lead = (c as { leads: LeadLite | null }).leads;
    if (!lead?.phone) continue;
    if (!passesCommonFilters(lead, rule.trigger_config)) continue;
    // confirma que a última msg é do SDR (não foi o contato que ficou sem resposta)
    const { data: lastMsg } = await supabaseAdmin
      .from("whatsapp_messages")
      .select("sender_type")
      .eq("conversation_id", (c as { id: string }).id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!lastMsg || lastMsg.sender_type === "contact") continue;
    leads.push(lead);
  }
  return leads;
}

async function evalMeetingReminder(rule: RuleRow): Promise<LeadLite[]> {
  const cfg = rule.trigger_config ?? {};
  const minutesBefore = (cfg.minutesBefore as number | undefined) ?? 60;
  const now = Date.now();
  const windowStart = new Date(now + (minutesBefore - 5) * 60_000).toISOString();
  const windowEnd = new Date(now + (minutesBefore + 5) * 60_000).toISOString();
  const { data } = await supabaseAdmin
    .from("leads")
    .select(
      "id,name,company_name,phone,priority,lead_type,assigned_to,stage_id,created_at,meeting_at",
    )
    .gte("meeting_at", windowStart)
    .lte("meeting_at", windowEnd)
    .not("phone", "is", null)
    .limit(500);
  return (data ?? []).filter((l) => passesCommonFilters(l, rule.trigger_config));
}

export async function runAutomationsTick(): Promise<{
  rulesProcessed: number;
  sent: number;
  failed: number;
  skipped: number;
}> {
  const { data: rules } = await supabaseAdmin
    .from("whatsapp_automation_rules")
    .select("*")
    .eq("active", true);

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const r of (rules ?? []) as RuleRow[]) {
    let targets: LeadLite[] = [];
    try {
      if (r.trigger_type === "new_lead") targets = await evalNewLead(r);
      else if (r.trigger_type === "stage_change") targets = await evalStageChange(r);
      else if (r.trigger_type === "no_reply") targets = await evalNoReply(r);
      else if (r.trigger_type === "meeting_reminder") targets = await evalMeetingReminder(r);
    } catch {
      continue;
    }
    for (const lead of targets) {
      if (await alreadyExecuted(r.id, lead.id)) {
        skipped++;
        continue;
      }
      const usingAiInitial = r.trigger_type === "new_lead";
      let res = usingAiInitial
        ? await executeAiInitialOutreachForLead(lead)
        : await executeRuleForLead(r, lead);
      // IA inicial desligada ou sem template: a 1ª mensagem sai pelo template da regra.
      if (usingAiInitial && !res.ok && r.template_id && /IA inicial/.test(res.error ?? ""))
        res = await executeRuleForLead(r, lead);
      if (res.ok) sent++;
      else failed++;

      if (usingAiInitial) {
        await supabaseAdmin.from("whatsapp_automation_logs").insert({
          rule_id: r.id,
          lead_id: lead.id,
          status: res.ok ? "sent" : "failed",
          error: res.error ?? null,
          executed_at: new Date().toISOString(),
        });
      }
    }
  }

  return { rulesProcessed: (rules ?? []).length, sent, failed, skipped };
}
