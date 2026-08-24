import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  CS_AGENDA_TYPES,
  CS_CLIENT_TYPES,
  CS_CONTACT_MODULES,
  CS_CONTACT_ORIGINS,
  CS_CONTACT_TYPES,
  CS_ORIGINS,
  CS_STAGES,
} from "@/lib/cs-types";

/** Carteira completa de CS + snapshots das últimas 8 semanas + alertas abertos. */
export const listCsBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { lastNWeeks, DEFAULT_STAGE_SLA } = await import("@/lib/cs-types");
    const { getStageSla, getHealthWeights, getRouting } = await import("@/lib/cs/cs-core.server");
    const weeks = lastNWeeks(8);

    const [clientsRes, snapsRes, alertsRes, tagsRes, profilesRes, sla, weights, routing] =
      await Promise.all([
        supabase.from("cs_clients").select("*").order("nome_empresa"),
        supabase
          .from("cs_signal_snapshots")
          .select("client_uid, week_start, signal, consumo_pct")
          .gte("week_start", weeks[0]),
        supabase.from("cs_alerts").select("*").eq("status", "open"),
        supabase.from("cs_client_tags").select("client_uid, tag, data_criacao"),
        supabase.from("profiles").select("id, full_name, email"),
        getStageSla(supabase),
        getHealthWeights(supabase),
        getRouting(supabase),
      ]);
    if (clientsRes.error) throw new Error(clientsRes.error.message);

    return {
      clients: clientsRes.data ?? [],
      snapshots: snapsRes.data ?? [],
      alerts: alertsRes.data ?? [],
      tags: tagsRes.data ?? [],
      profiles: profilesRes.data ?? [],
      weeks,
      sla: sla ?? DEFAULT_STAGE_SLA,
      weights,
      routing,
    };
  });

/** Detalhe completo do cliente para o card (abas). */
export const getCsClient = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ clientUid: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { lastNWeeks } = await import("@/lib/cs-types");
    const weeks = lastNWeeks(8);
    const [client, contacts, tags, snaps, records, timeline, alerts, children, profiles] =
      await Promise.all([
        supabase.from("cs_clients").select("*").eq("client_uid", data.clientUid).maybeSingle(),
        supabase.from("cs_contacts").select("*").eq("client_uid", data.clientUid).order("nome"),
        supabase
          .from("cs_client_tags")
          .select("*")
          .eq("client_uid", data.clientUid)
          .order("data_criacao", { ascending: false }),
        supabase
          .from("cs_signal_snapshots")
          .select("*")
          .eq("client_uid", data.clientUid)
          .gte("week_start", weeks[0])
          .order("week_start"),
        supabase
          .from("cs_records")
          .select("*")
          .eq("client_uid", data.clientUid)
          .order("created_at", { ascending: false }),
        supabase
          .from("cs_timeline_events")
          .select("*")
          .eq("client_uid", data.clientUid)
          .order("occurred_at", { ascending: false })
          .limit(200),
        supabase
          .from("cs_alerts")
          .select("*")
          .eq("client_uid", data.clientUid)
          .order("created_at", { ascending: false }),
        supabase
          .from("cs_clients")
          .select("client_uid, nome_empresa, current_signal, health_score")
          .eq("parent_client_uid", data.clientUid),
        supabase.from("profiles").select("id, full_name, email"),
      ]);
    if (!client.data) throw new Error("Cliente não encontrado");
    return {
      client: client.data,
      contacts: contacts.data ?? [],
      tags: tags.data ?? [],
      snapshots: snaps.data ?? [],
      records: records.data ?? [],
      timeline: timeline.data ?? [],
      alerts: alerts.data ?? [],
      children: children.data ?? [],
      profiles: profiles.data ?? [],
      weeks,
    };
  });

/** Cria/edita cliente. Na criação, aplica roteamento automático quando não informado. */
export const saveCsClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        clientUid: z.string().optional(),
        nome_empresa: z.string().min(1),
        cnpj: z.string().nullish(),
        parent_client_uid: z.string().nullish(),
        tipo_lead: z.enum(CS_CLIENT_TYPES),
        origem: z.enum(CS_ORIGINS),
        aporte_valor: z.number().min(0).default(0),
        cs_responsavel_id: z.string().uuid().nullish(),
        comercial_responsavel_id: z.string().uuid().nullish(),
        data_inicio_contrato: z.string().nullish(),
        data_renovacao: z.string().nullish(),
        login_pda: z.string().nullish(),
        linkedin_url: z.string().nullish(),
        site_url: z.string().nullish(),
        setor: z.string().nullish(),
        dg_ativo: z.boolean().default(false),
        journey_stage: z.enum(CS_STAGES).default("onboarding"),
        ativo: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { resolveCsRouting, logTimeline } = await import("@/lib/cs/cs-core.server");
    const { clientUid, ...fields } = data;

    if (clientUid) {
      const { data: updated, error } = await supabase
        .from("cs_clients")
        .update(fields as never)
        .eq("client_uid", clientUid)
        .select("client_uid")
        .maybeSingle();
      if (error) throw new Error(error.message);
      await logTimeline(supabase, {
        client_uid: clientUid,
        author_id: userId,
        event_type: "cliente_atualizado",
        title: "Dados do cliente atualizados",
      });
      return { client_uid: updated?.client_uid ?? clientUid };
    }

    let cs = fields.cs_responsavel_id ?? null;
    let comercial = fields.comercial_responsavel_id ?? null;
    if (!cs || !comercial) {
      const routed = await resolveCsRouting(supabase, {
        tipo_lead: fields.tipo_lead,
        origem: fields.origem,
        aporte_valor: fields.aporte_valor,
        comercial_fechou: comercial,
      });
      cs = cs ?? routed.cs_responsavel_id;
      comercial = comercial ?? routed.comercial_responsavel_id;
    }

    const { data: created, error } = await supabase
      .from("cs_clients")
      .insert({
        ...fields,
        cs_responsavel_id: cs,
        comercial_responsavel_id: comercial,
        created_by: userId,
      } as never)
      .select("client_uid")
      .single();
    if (error) throw new Error(error.message);
    await logTimeline(supabase, {
      client_uid: created.client_uid,
      author_id: userId,
      event_type: "card_criado",
      title: `Cliente cadastrado (${created.client_uid})`,
      metadata: { cs_responsavel_id: cs, comercial_responsavel_id: comercial },
    });
    return { client_uid: created.client_uid };
  });

/** Move o cliente entre etapas da jornada, registrando na timeline. */
export const moveCsStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ clientUid: z.string().min(1), stage: z.enum(CS_STAGES) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { logTimeline } = await import("@/lib/cs/cs-core.server");
    const { CS_STAGE_LABEL } = await import("@/lib/cs-types");
    const { error } = await supabase
      .from("cs_clients")
      .update({ journey_stage: data.stage, stage_entered_at: new Date().toISOString() })
      .eq("client_uid", data.clientUid);
    if (error) throw new Error(error.message);
    await logTimeline(supabase, {
      client_uid: data.clientUid,
      author_id: userId,
      event_type: "etapa_alterada",
      title: `Etapa alterada para ${CS_STAGE_LABEL[data.stage]}`,
    });
    return { ok: true };
  });

export const setCsOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        clientUid: z.string().min(1),
        field: z.enum(["cs_responsavel_id", "comercial_responsavel_id"]),
        userId: z.string().uuid().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { logTimeline } = await import("@/lib/cs/cs-core.server");
    const { error } = await supabase
      .from("cs_clients")
      .update({ [data.field]: data.userId } as never)
      .eq("client_uid", data.clientUid);
    if (error) throw new Error(error.message);
    await logTimeline(supabase, {
      client_uid: data.clientUid,
      author_id: userId,
      event_type: "responsavel_alterado",
      title: data.field === "cs_responsavel_id" ? "Responsável de CS alterado" : "Responsável comercial alterado",
      metadata: { novo_responsavel: data.userId },
    });
    return { ok: true };
  });

export const saveCsContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        client_uid: z.string().min(1),
        nome: z.string().min(1),
        email: z.string().nullish(),
        whatsapp: z.string().nullish(),
        cargo: z.string().nullish(),
        modulos_vinculados: z.array(z.enum(CS_CONTACT_MODULES)).default([]),
        origem_detecao: z.enum(CS_CONTACT_ORIGINS).default("manual"),
        ativo_no_cliente: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { id, ...fields } = data;
    if (id) {
      const { error } = await supabase.from("cs_contacts").update(fields as never).eq("id", id);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: created, error } = await supabase
      .from("cs_contacts")
      .insert(fields as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id };
  });

export const deleteCsContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("cs_contacts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addCsTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ clientUid: z.string().min(1), tag: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { addClientTag } = await import("@/lib/cs/cs-core.server");
    await addClientTag(context.supabase, {
      client_uid: data.clientUid,
      tag: data.tag.trim().toLowerCase().replace(/\s+/g, "_"),
      created_by: context.userId,
    });
    return { ok: true };
  });

export const removeCsTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("cs_client_tags").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addCsRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        clientUid: z.string().min(1),
        tipo: z.string().default("nota"),
        content: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("cs_records").insert({
      client_uid: data.clientUid,
      tipo: data.tipo,
      content: data.content,
      author_id: context.userId,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Resolve o alerta do Kanban (modal obrigatório): registra contato, tag e follow-up. */
export const resolveCsAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        alertId: z.string().uuid(),
        contact_type: z.enum(CS_CONTACT_TYPES),
        whatsapp_answered: z.boolean().nullish(),
        agenda_type: z.enum(CS_AGENDA_TYPES).nullish(),
        observation: z.string().nullish(),
        cliente_autossuficiente: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { addClientTag, logTimeline, recomputeHealth, tagForAgenda } = await import(
      "@/lib/cs/cs-core.server"
    );
    const { CS_AGENDA_TYPE_LABEL, CS_CONTACT_TYPE_LABEL } = await import("@/lib/cs-types");

    const { data: alert, error: alertErr } = await supabase
      .from("cs_alerts")
      .select("*")
      .eq("id", data.alertId)
      .maybeSingle();
    if (alertErr) throw new Error(alertErr.message);
    if (!alert) throw new Error("Alerta não encontrado");

    if (data.contact_type === "agenda" && !data.agenda_type) {
      throw new Error("Informe o tipo de agenda");
    }
    if (data.contact_type === "whatsapp" && data.whatsapp_answered == null) {
      throw new Error("Informe se o WhatsApp foi respondido");
    }

    const now = new Date();
    const needsFollowUp = data.contact_type === "whatsapp" && data.whatsapp_answered === false;
    const followUpAt = needsFollowUp ? new Date(now.getTime() + 2 * 86400000).toISOString() : null;
    const engajou = data.cliente_autossuficiente || data.whatsapp_answered === true || data.contact_type === "agenda";

    const { error } = await supabase
      .from("cs_alerts")
      .update({
        status: needsFollowUp ? "follow_up" : "resolved",
        contact_type: data.contact_type,
        whatsapp_answered: data.whatsapp_answered ?? null,
        agenda_type: data.agenda_type ?? null,
        observation: data.observation ?? null,
        resolved_by: userId,
        resolved_at: now.toISOString(),
        follow_up_at: followUpAt,
      })
      .eq("id", data.alertId);
    if (error) throw new Error(error.message);

    if (data.agenda_type) {
      await addClientTag(supabase, {
        client_uid: alert.client_uid,
        tag: tagForAgenda(data.agenda_type),
        origem_agenda_id: data.alertId,
        created_by: userId,
      });
    }

    await logTimeline(supabase, {
      client_uid: alert.client_uid,
      author_id: userId,
      event_type: data.contact_type === "agenda" ? "agenda" : "contato",
      channel: data.contact_type === "ligacao" ? "ligacao" : data.contact_type,
      title:
        data.contact_type === "agenda"
          ? `Agenda: ${CS_AGENDA_TYPE_LABEL[data.agenda_type ?? ""] ?? "—"}`
          : `Contato por ${CS_CONTACT_TYPE_LABEL[data.contact_type]}`,
      description: data.observation ?? alert.reason,
      metadata: {
        alert_id: data.alertId,
        alert_type: alert.alert_type,
        answered: data.whatsapp_answered === true,
        engajamento: engajou,
        autossuficiente: data.cliente_autossuficiente,
      },
    });

    await supabase
      .from("cs_clients")
      .update({ last_contact_at: now.toISOString() })
      .eq("client_uid", alert.client_uid);
    await recomputeHealth(supabase, alert.client_uid);

    return { ok: true, followUpAt };
  });

/** Varre a carteira e cria os alertas pendentes. */
export const runCsAlertScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { generateCsAlerts } = await import("@/lib/cs/cs-core.server");
    return generateCsAlerts(context.supabase);
  });

export const saveCsSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        weights: z
          .object({
            sinaleira_pda: z.number().min(0).max(100),
            agenda_90d: z.number().min(0).max(100),
            whatsapp_respondido: z.number().min(0).max(100),
            email_respondido: z.number().min(0).max(100),
            uso_plataforma_cs: z.number().min(0).max(100),
          })
          .optional(),
        sla: z
          .object({
            onboarding: z.number().int().min(1).max(400),
            ativacao: z.number().int().min(1).max(400),
            renovacao: z.number().int().min(1).max(400),
            sem_contato_dias: z.number().int().min(1).max(365),
          })
          .optional(),
        routing: z
          .object({
            aporte_threshold: z.number().min(0),
            consultoria_cs: z.string().uuid().nullable(),
            cs_round_robin: z.array(z.string().uuid()),
            comercial_high: z.array(z.string().uuid()),
            renovacao_cs: z.string().uuid().nullable(),
          })
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { getRouting, saveCsSetting } = await import("@/lib/cs/cs-core.server");
    const { data: isManager } = await supabase.rpc("is_manager", { _user_id: userId });
    if (!isManager) throw new Error("Apenas a gestão pode alterar as configurações de CS");
    if (data.weights) await saveCsSetting(supabase, "health_weights", data.weights);
    if (data.sla) await saveCsSetting(supabase, "stage_sla_days", data.sla);
    if (data.routing) {
      const current = await getRouting(supabase);
      await saveCsSetting(supabase, "routing", { ...data.routing, rr_cursor: current.rr_cursor });
    }
    return { ok: true };
  });

/** Importa a carteira (CSV/Excel convertido em linhas no cliente). */
export const importCsClients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        rows: z
          .array(
            z.object({
              nome_empresa: z.string().min(1),
              cnpj: z.string().nullish(),
              parent_nome: z.string().nullish(),
              tipo_lead: z.enum(CS_CLIENT_TYPES).default("empresa"),
              origem: z.enum(CS_ORIGINS).default("marketing"),
              aporte_valor: z.number().default(0),
              login_pda: z.string().nullish(),
              linkedin_url: z.string().nullish(),
              site_url: z.string().nullish(),
              data_inicio_contrato: z.string().nullish(),
              data_renovacao: z.string().nullish(),
              cs_responsavel_email: z.string().nullish(),
              comercial_responsavel_email: z.string().nullish(),
            }),
          )
          .max(3000),
        autoRoute: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { resolveCsRouting, logTimeline } = await import("@/lib/cs/cs-core.server");

    const [{ data: existing }, { data: profiles }] = await Promise.all([
      supabase.from("cs_clients").select("client_uid, nome_empresa"),
      supabase.from("profiles").select("id, email"),
    ]);
    const norm = (s: string) => s.trim().toLowerCase();
    const byName = new Map((existing ?? []).map((c) => [norm(c.nome_empresa), c.client_uid]));
    const emailToId = new Map(
      (profiles ?? []).filter((p) => p.email).map((p) => [norm(p.email as string), p.id]),
    );

    let created = 0;
    let skipped = 0;
    const parents: Array<{ child: string; parentName: string }> = [];

    for (const row of data.rows) {
      if (byName.has(norm(row.nome_empresa))) {
        skipped++;
        continue;
      }
      let cs = row.cs_responsavel_email ? emailToId.get(norm(row.cs_responsavel_email)) ?? null : null;
      let comercial = row.comercial_responsavel_email
        ? emailToId.get(norm(row.comercial_responsavel_email)) ?? null
        : null;
      if (data.autoRoute && (!cs || !comercial)) {
        const routed = await resolveCsRouting(supabase, {
          tipo_lead: row.tipo_lead,
          origem: row.origem,
          aporte_valor: row.aporte_valor,
          comercial_fechou: comercial,
        });
        cs = cs ?? routed.cs_responsavel_id;
        comercial = comercial ?? routed.comercial_responsavel_id;
      }

      const { data: inserted, error } = await supabase
        .from("cs_clients")
        .insert({
          nome_empresa: row.nome_empresa,
          cnpj: row.cnpj ?? null,
          tipo_lead: row.tipo_lead,
          origem: row.origem,
          aporte_valor: row.aporte_valor,
          login_pda: row.login_pda ?? null,
          linkedin_url: row.linkedin_url ?? null,
          site_url: row.site_url ?? null,
          data_inicio_contrato: row.data_inicio_contrato ?? null,
          data_renovacao: row.data_renovacao ?? null,
          cs_responsavel_id: cs,
          comercial_responsavel_id: comercial,
          created_by: userId,
        } as never)
        .select("client_uid")
        .single();
      if (error) throw new Error(`${row.nome_empresa}: ${error.message}`);
      byName.set(norm(row.nome_empresa), inserted.client_uid);
      created++;
      if (row.parent_nome) parents.push({ child: inserted.client_uid, parentName: row.parent_nome });
      await logTimeline(supabase, {
        client_uid: inserted.client_uid,
        author_id: userId,
        event_type: "card_criado",
        title: `Cliente importado (${inserted.client_uid})`,
      });
    }

    let linked = 0;
    for (const p of parents) {
      const parentUid = byName.get(norm(p.parentName));
      if (!parentUid || parentUid === p.child) continue;
      const { error } = await supabase
        .from("cs_clients")
        .update({ parent_client_uid: parentUid })
        .eq("client_uid", p.child);
      if (!error) linked++;
    }

    return { created, skipped, linked };
  });

/** Sincroniza a sinaleira com a aba mais recente da planilha. */
export const syncCsSignal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ tab: z.string().optional(), weekStart: z.string().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isManager } = await supabase.rpc("is_manager", { _user_id: userId });
    if (!isManager) throw new Error("Apenas a gestão pode sincronizar a sinaleira");
    const { syncSignalFromSheet } = await import("@/lib/cs/signal-sync.server");
    return syncSignalFromSheet({ tab: data.tab, weekStart: data.weekStart });
  });

/** Abas disponíveis na planilha da sinaleira (para escolher manualmente). */
export const listCsSignalTabs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { listSheetTabs, pickLatestTab } = await import("@/lib/cs/signal-sync.server");
    try {
      const tabs = await listSheetTabs();
      return { ok: true as const, tabs, latest: pickLatestTab(tabs) };
    } catch (e) {
      return { ok: false as const, tabs: [] as string[], latest: null, error: e instanceof Error ? e.message : String(e) };
    }
  });
