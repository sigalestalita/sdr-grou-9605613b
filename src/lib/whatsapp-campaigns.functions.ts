import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { renderTemplate } from "./whatsapp-templates.functions";
import { makeExclusionMatcher } from "./campaign-exclusions";

const AudienceFilters = z
  .object({
    stageIds: z.array(z.string().uuid()).optional(),
    priorities: z.array(z.enum(["alta", "media", "baixa"])).optional(),
    demoFree: z.enum(["any", "yes", "no"]).optional(),
    assignedToMe: z.boolean().optional(),
    leadType: z.array(z.string()).optional(),
    companySizes: z.array(z.string()).optional(),
    emailDomains: z.array(z.string()).optional(),
    /** Data de entrada do lead (created_at) — formato YYYY-MM-DD. */
    createdFrom: z.string().optional(),
    createdTo: z.string().optional(),
  })
  .default({});
type AudienceFiltersT = z.infer<typeof AudienceFilters>;
export type CampaignAudienceFilters = AudienceFiltersT;

const PhoneEntry = z.object({
  phone: z.string().min(6).max(40),
  name: z.string().max(160).optional(),
  company: z.string().max(160).optional(),
});
export type CampaignPhoneEntry = z.infer<typeof PhoneEntry>;

const Exclusions = z
  .object({
    phones: z.array(z.string().max(40)).max(5000).optional(),
    names: z.array(z.string().max(160)).max(5000).optional(),
  })
  .optional();

const Audience = z
  .object({
    source: z.enum(["filters", "phones"]).default("filters"),
    filters: AudienceFilters.optional(),
    phones: z.array(PhoneEntry).max(5000).optional(),
    exclusions: Exclusions,
  })
  .default({ source: "filters" });
export type CampaignAudience = z.infer<typeof Audience>;

/** Parser tolerante: aceita o formato antigo (filtros diretos) e o novo (com source). */
function parseAudience(raw: unknown): CampaignAudience {
  if (raw && typeof raw === "object" && "source" in (raw as Record<string, unknown>)) {
    return Audience.parse(raw);
  }
  return Audience.parse({ source: "filters", filters: AudienceFilters.parse(raw ?? {}) });
}

function normPhone(raw: string): string {
  const digits = raw.replace(/\D+/g, "").replace(/^0+/, "");
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) {
    return `55${digits}`;
  }
  return digits;
}

function normDomain(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@+/, "");
}

/** Converte YYYY-MM-DD em limites ISO (início do dia / fim do dia). */
function dayStartIso(d: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T00:00:00.000Z` : null;
}
function dayEndIso(d: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T23:59:59.999Z` : null;
}

/** Lista campanhas com contagem de mensagens. */
export const listCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("whatsapp_campaigns")
      .select("*, whatsapp_templates:template_id(name)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { campaigns: data ?? [] };
  });

/** Detalhe da campanha + métricas de envio. */
export const getCampaign = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: campaign, error: cErr } = await supabase
      .from("whatsapp_campaigns")
      .select("*, whatsapp_templates:template_id(*)")
      .eq("id", data.id)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!campaign) throw new Error("Campanha não encontrada");

    const { data: msgs } = await supabase
      .from("whatsapp_campaign_messages")
      .select("*, leads:lead_id(id,name,company_name,phone)")
      .eq("campaign_id", data.id)
      .order("created_at", { ascending: false })
      .limit(500);

    const list = msgs ?? [];
    const stats = {
      total: list.length,
      sent: list.filter((m) => m.status === "sent" || m.status === "delivered" || m.status === "read").length,
      delivered: list.filter((m) => m.status === "delivered" || m.status === "read").length,
      read: list.filter((m) => m.status === "read").length,
      failed: list.filter((m) => m.status === "failed").length,
      pending: list.filter((m) => m.status === "pending").length,
    };

    return { campaign, messages: list, stats };
  });

/** Respostas recebidas dos leads da campanha (mensagens inbound após o disparo). */
export const listCampaignReplies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const { data: sends, error: sErr } = await supabase
      .from("whatsapp_campaign_messages")
      .select("lead_id, sent_at, created_at")
      .eq("campaign_id", data.id)
      .limit(2000);
    if (sErr) throw new Error(sErr.message);

    const sentAtByLead = new Map<string, string>();
    for (const s of sends ?? []) {
      if (!s.lead_id) continue;
      const at = s.sent_at ?? s.created_at;
      const prev = sentAtByLead.get(s.lead_id);
      if (!prev || (at && at < prev)) sentAtByLead.set(s.lead_id, at as string);
    }
    const leadIds = [...sentAtByLead.keys()];
    if (leadIds.length === 0) return { replies: [] };

    const { data: msgs, error: mErr } = await supabase
      .from("whatsapp_messages")
      .select("id, lead_id, body, message_type, created_at, sent_at, conversation_id")
      .in("lead_id", leadIds)
      .eq("sender_type", "lead")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (mErr) throw new Error(mErr.message);

    const relevant = (msgs ?? []).filter((m) => {
      const ref = sentAtByLead.get(m.lead_id!);
      const at = m.sent_at ?? m.created_at;
      return !!ref && !!at && at >= ref;
    });
    if (relevant.length === 0) return { replies: [] };

    const { data: leads } = await supabase
      .from("leads")
      .select("id, name, company_name, phone, assigned_to, priority")
      .in("id", [...new Set(relevant.map((m) => m.lead_id!))]);

    const ownerIds = [...new Set((leads ?? []).map((l) => l.assigned_to).filter((v): v is string => !!v))];
    const { data: owners } = ownerIds.length
      ? await supabase.from("profiles").select("id, full_name, email").in("id", ownerIds)
      : { data: [] as Array<{ id: string; full_name: string | null; email: string | null }> };

    const leadById = new Map((leads ?? []).map((l) => [l.id, l]));
    const ownerById = new Map((owners ?? []).map((o) => [o.id, o]));

    const replies = relevant.map((m) => {
      const lead = leadById.get(m.lead_id!);
      const owner = lead?.assigned_to ? ownerById.get(lead.assigned_to) : null;
      return {
        id: m.id,
        lead_id: m.lead_id!,
        lead_name: lead?.name ?? null,
        company_name: lead?.company_name ?? null,
        phone: lead?.phone ?? null,
        priority: lead?.priority ?? null,
        message_type: m.message_type,
        body: m.body,
        received_at: (m.sent_at ?? m.created_at) as string,
        sdr_name: owner?.full_name ?? owner?.email ?? null,
      };
    });

    const firstByLead = new Map<string, string>();
    for (const r of [...replies].sort((a, b) => a.received_at.localeCompare(b.received_at))) {
      if (!firstByLead.has(r.lead_id)) firstByLead.set(r.lead_id, r.id);
    }

    return {
      replies: replies.map((r) => ({ ...r, is_first: firstByLead.get(r.lead_id) === r.id })),
    };
  });

/** Preview de audiência: conta e amostra de leads. */
export const previewAudience = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        // legado
        filters: AudienceFilters.optional(),
        // novo
        audience: Audience.optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const audience = data.audience ?? parseAudience(data.filters ?? {});

    if (audience.source === "phones") {
      const isExcluded = makeExclusionMatcher(audience.exclusions);
      const phones = (audience.phones ?? [])
        .map((p) => ({ ...p, phone: normPhone(p.phone) }))
        .filter((p) => p.phone)
        .filter((p) => !isExcluded({ name: p.name ?? null, company_name: p.company ?? null, phone: p.phone }));
      return {
        count: phones.length,
        sample: phones.slice(0, 20).map((p, i) => ({
          id: `phone-${i}`,
          name: p.name ?? null,
          company_name: p.company ?? null,
          phone: p.phone,
          priority: null,
          stage_id: null,
        })),
      };
    }

    const f = audience.filters ?? {};
    let q = supabase.from("leads").select("id, name, company_name, phone, priority, stage_id");
    if (f.stageIds?.length) q = q.in("stage_id", f.stageIds);
    if (f.priorities?.length) q = q.in("priority", f.priorities);
    if (f.demoFree === "yes") q = q.eq("demo_free", true);
    if (f.demoFree === "no") q = q.eq("demo_free", false);
    if (f.assignedToMe) q = q.eq("assigned_to", userId);
    if (f.leadType?.length) q = q.in("lead_type", f.leadType);
    if (f.companySizes?.length) q = q.in("company_size", f.companySizes);
    if (f.emailDomains?.length) {
      const ors = f.emailDomains.map((d) => `email.ilike.%@${normDomain(d)}`).join(",");
      q = q.or(ors);
    }
    if (f.createdFrom) {
      const iso = dayStartIso(f.createdFrom);
      if (iso) q = q.gte("created_at", iso);
    }
    if (f.createdTo) {
      const iso = dayEndIso(f.createdTo);
      if (iso) q = q.lte("created_at", iso);
    }
    q = q.not("phone", "is", null).limit(5000);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const isExcluded = makeExclusionMatcher(audience.exclusions);
    const all = rows ?? [];
    const kept = all.filter((r) => !isExcluded(r));
    return { count: kept.length, sample: kept.slice(0, 20), excluded: all.length - kept.length };
  });

/** Cria campanha em rascunho. */
export const createCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        name: z.string().min(1).max(160),
        templateId: z.string().uuid(),
        accountId: z.string().uuid().nullable().optional(),
        filters: AudienceFilters.optional(),
        audience: Audience.optional(),
        scheduledAt: z.string().datetime().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const audience = data.audience ?? parseAudience(data.filters ?? {});
    const { data: row, error } = await supabase
      .from("whatsapp_campaigns")
      .insert({
        name: data.name,
        template_id: data.templateId,
        account_id: data.accountId ?? null,
        audience_filters: audience,
        status: "draft",
        scheduled_at: data.scheduledAt ?? null,
        created_by: userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { campaign: row };
  });

/** Dispara a campanha agora (envia até `limit` mensagens). */
export const launchCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), limit: z.number().int().min(1).max(500).default(200) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // checa permissão (manager)
    const { data: isMgr } = await supabase.rpc("is_manager", { _user_id: userId });
    if (!isMgr) throw new Error("Apenas gestão/admin podem disparar campanhas");

    const { data: campaign, error: cErr } = await supabase
      .from("whatsapp_campaigns")
      .select("*, whatsapp_templates:template_id(*)")
      .eq("id", data.id)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!campaign) throw new Error("Campanha não encontrada");
    const tmpl = (campaign as { whatsapp_templates: { body: string } | null }).whatsapp_templates;
    if (!tmpl?.body) throw new Error("Template inválido");
    const tmplFull = (campaign as {
      whatsapp_templates: {
        body: string;
        provider_template_name: string | null;
        language: string | null;
        variables: unknown;
      } | null;
    }).whatsapp_templates!;
    const useHsm = !!tmplFull.provider_template_name;
    const tmplVarNames = Array.isArray(tmplFull.variables)
      ? (tmplFull.variables as unknown[]).map((v) => String(v))
      : [];

    const audience = parseAudience(campaign.audience_filters ?? {});

    // imports server-only
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getProvider } = await import("./whatsapp/provider-registry.server");

    type Target = { id: string; name: string | null; company_name: string | null; phone: string | null; assigned_to: string | null };
    let targets: Target[] = [];

    if (audience.source === "phones") {
      const isExcludedEntry = makeExclusionMatcher(audience.exclusions);
      const entries = (audience.phones ?? [])
        .filter((e) => !isExcludedEntry({ name: e.name ?? null, company_name: e.company ?? null, phone: e.phone }))
        .slice(0, data.limit);
      for (const e of entries) {
        const phone = normPhone(e.phone);
        if (!phone) continue;
        // tenta achar lead existente pelo final do telefone
        const tail = phone.slice(-8);
        const { data: match } = await supabaseAdmin
          .from("leads")
          .select("id, name, company_name, phone, assigned_to")
          .filter("phone", "ilike", `%${tail}%`)
          .limit(1)
          .maybeSingle();
        if (match) {
          targets.push(match as Target);
          continue;
        }
        const ins = await supabaseAdmin
          .from("leads")
          .insert({
            name: e.name?.trim() || `+${phone}`,
            phone,
            company_name: e.company?.trim() || null,
            source: "campaign_upload",
          })
          .select("id, name, company_name, phone, assigned_to")
          .single();
        if (ins.data) targets.push(ins.data as Target);
      }
    } else {
      const f = audience.filters ?? {};
      let q = supabase.from("leads").select("id, name, company_name, phone, assigned_to");
      if (f.stageIds?.length) q = q.in("stage_id", f.stageIds);
      if (f.priorities?.length) q = q.in("priority", f.priorities);
      if (f.demoFree === "yes") q = q.eq("demo_free", true);
      if (f.demoFree === "no") q = q.eq("demo_free", false);
      if (f.assignedToMe) q = q.eq("assigned_to", userId);
      if (f.leadType?.length) q = q.in("lead_type", f.leadType);
      if (f.companySizes?.length) q = q.in("company_size", f.companySizes);
      if (f.emailDomains?.length) {
        const ors = f.emailDomains.map((d) => `email.ilike.%@${normDomain(d)}`).join(",");
        q = q.or(ors);
      }
      if (f.createdFrom) {
        const iso = dayStartIso(f.createdFrom);
        if (iso) q = q.gte("created_at", iso);
      }
      if (f.createdTo) {
        const iso = dayEndIso(f.createdTo);
        if (iso) q = q.lte("created_at", iso);
      }
      q = q.not("phone", "is", null).limit(Math.min(5000, data.limit + 2000));
      const { data: leads, error: lErr } = await q;
      if (lErr) throw new Error(lErr.message);
      const isExcludedLead = makeExclusionMatcher(audience.exclusions);
      targets = ((leads ?? []) as Target[]).filter((l) => !isExcludedLead(l)).slice(0, data.limit);
    }

    if (targets.length === 0) {
      await supabase
        .from("whatsapp_campaigns")
        .update({ status: "completed", started_at: new Date().toISOString(), completed_at: new Date().toISOString() })
        .eq("id", data.id);
      return { ok: true, queued: 0, sent: 0, failed: 0 };
    }

    await supabase
      .from("whatsapp_campaigns")
      .update({ status: "sending", started_at: new Date().toISOString() })
      .eq("id", data.id);

    const accountQuery = campaign.account_id
      ? supabaseAdmin.from("whatsapp_accounts").select("*").eq("id", campaign.account_id).maybeSingle()
      : supabaseAdmin.from("whatsapp_accounts").select("*").eq("is_default", true).maybeSingle();
    const { data: account } = await accountQuery;
    if (!account) throw new Error("Nenhuma conta de WhatsApp configurada");
    const provider = getProvider(account.provider);

    let sent = 0;
    let failed = 0;

    for (const lead of targets) {
      const phone = normPhone(lead.phone ?? "");
      if (!phone) {
        failed++;
        continue;
      }
      const body = renderTemplate(tmpl.body, {
        nome: lead.name ?? "",
        primeiro_nome: (lead.name ?? "").split(" ")[0] ?? "",
        empresa: lead.company_name ?? "",
      });
      const leadCtx: Record<string, string> = {
        nome: lead.name ?? "",
        primeiro_nome: (lead.name ?? "").split(" ")[0] ?? "",
        empresa: lead.company_name ?? "",
      };
      const templateParams = tmplVarNames.map((n) => leadCtx[n] ?? "");

      // garante conversa
      let convId: string | null = null;
      const { data: existing } = await supabaseAdmin
        .from("whatsapp_conversations")
        .select("id")
        .eq("lead_id", lead.id)
        .maybeSingle();
      if (existing) {
        convId = existing.id;
      } else {
        const { data: created } = await supabaseAdmin
          .from("whatsapp_conversations")
          .insert({
            lead_id: lead.id,
            account_id: account.id,
            assigned_user_id: lead.assigned_to ?? userId,
            status: "open",
          })
          .select("id")
          .single();
        convId = created?.id ?? null;
      }
      if (!convId) {
        failed++;
        continue;
      }

      const { data: msg } = await supabaseAdmin
        .from("whatsapp_messages")
        .insert({
          conversation_id: convId,
          lead_id: lead.id,
          sender_type: "sdr",
          sender_user_id: userId,
          message_type: "text",
          body,
          status: "sending",
        })
        .select("id")
        .single();

      try {
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
          to: phone,
          ...(useHsm
            ? {
                type: "template" as const,
                templateName: tmplFull.provider_template_name!,
                templateLanguage: tmplFull.language ?? "pt_BR",
                templateParams,
                // o body renderizado é salvo no chat só para histórico
                body,
              }
            : { type: "text" as const, body }),
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

        await supabaseAdmin.from("whatsapp_campaign_messages").insert({
          campaign_id: data.id,
          lead_id: lead.id,
          message_id: msg?.id ?? null,
          status: result.status === "failed" ? "failed" : "sent",
          error: result.error ?? null,
          sent_at: new Date().toISOString(),
        });

        if (result.status === "failed") failed++;
        else sent++;
      } catch (e) {
        const message = e instanceof Error ? e.message : "Falha";
        if (msg?.id) {
          await supabaseAdmin
            .from("whatsapp_messages")
            .update({ status: "failed", error: message })
            .eq("id", msg.id);
        }
        await supabaseAdmin.from("whatsapp_campaign_messages").insert({
          campaign_id: data.id,
          lead_id: lead.id,
          message_id: msg?.id ?? null,
          status: "failed",
          error: message,
        });
        failed++;
      }
    }

    await supabaseAdmin
      .from("whatsapp_campaigns")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", data.id);

    return { ok: true, queued: targets.length, sent, failed };
  });

/** Lista estágios e tipos de lead (para o builder de filtros). */
export const getCampaignFilterMeta = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [{ data: stages }, { data: types }, { data: sizes }] = await Promise.all([
      supabase.from("stages").select("id, name, position").order("position"),
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      supabase.from("leads").select("lead_type").not("lead_type", "is", null).limit(2000),
      supabase.from("leads").select("company_size").not("company_size", "is", null).limit(2000),
    ]);
    const leadTypes = Array.from(
      new Set((types ?? []).map((r) => (r as { lead_type: string | null }).lead_type).filter(Boolean) as string[]),
    );
    const companySizes = Array.from(
      new Set((sizes ?? []).map((r) => (r as { company_size: string | null }).company_size).filter(Boolean) as string[]),
    ).sort();
    return { stages: stages ?? [], leadTypes, companySizes };
  });