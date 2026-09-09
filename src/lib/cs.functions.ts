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
  CS_SERVICE_TYPES,
  CS_STAGES,
  CS_TAG_USO,
} from "@/lib/cs-types";

/** Carteira completa de CS + snapshots das últimas 8 semanas + alertas abertos. */
export const listCsBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { lastNWeeks, DEFAULT_STAGE_SLA } = await import("@/lib/cs-types");
    const {
      getStageSla,
      getHealthWeights,
      getHealthSignalPoints,
      getHealthOptions,
      getDailyTarget,
      getRouting,
      getEvidenceConfig,
      getEscalationConfig,
      getMasterclassConfig,
      getFeaturesConfig,
      fetchAllRows,
    } = await import("@/lib/cs/cs-core.server");
    const weeks = lastNWeeks(8);

    const [
      clients,
      snapshots,
      alerts,
      tags,
      profilesRes,
      sla,
      weights,
      routing,
      signalPoints,
      options,
      dailyTarget,
      evidence,
      escalation,
      masterclass,
      features,
    ] = await Promise.all([
      fetchAllRows((f, t) =>
        supabase.from("cs_clients").select("*").order("nome_empresa").range(f, t),
      ),
      fetchAllRows((f, t) =>
        supabase
          .from("cs_signal_snapshots")
          .select("client_uid, week_start, signal, consumo_pct, metadata")
          .gte("week_start", weeks[0])
          .order("week_start")
          .range(f, t),
      ),
      fetchAllRows((f, t) =>
        supabase.from("cs_alerts").select("*").eq("status", "open").range(f, t),
      ),
      fetchAllRows((f, t) =>
        supabase.from("cs_client_tags").select("client_uid, tag, data_criacao").range(f, t),
      ),
      supabase.from("profiles").select("id, full_name, email"),
      getStageSla(supabase),
      getHealthWeights(supabase),
      getRouting(supabase),
      getHealthSignalPoints(supabase),
      getHealthOptions(supabase),
      getDailyTarget(supabase),
      getEvidenceConfig(supabase),
      getEscalationConfig(supabase),
      getMasterclassConfig(supabase),
      getFeaturesConfig(supabase),
    ]);

    return {
      clients,
      snapshots,
      alerts,
      tags,
      profiles: profilesRes.data ?? [],
      weeks,
      sla: sla ?? DEFAULT_STAGE_SLA,
      weights,
      routing,
      signalPoints,
      options,
      dailyTarget,
      evidence,
      escalation,
      masterclass,
      features,
    };
  });

const mondayOfDate = (d: Date) => {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = x.getUTCDay();
  x.setUTCDate(x.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return x.toISOString().slice(0, 10);
};

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

    // Canais de atendimento: e-mails redirecionados, agenda (Calendly) e WhatsApp.
    const digits = (v?: string | null) => (v ?? "").replace(/\D/g, "");
    const phones = Array.from(
      new Set((contacts.data ?? []).map((c) => digits(c.whatsapp)).filter((p) => p.length >= 8)),
    );

    const [emailsRes, agendaRes] = await Promise.all([
      supabase
        .from("cs_emails")
        .select(
          "id, direction, from_email, from_name, to_emails, cc_emails, subject, snippet, body_text, received_at, owner_user_id",
        )
        .eq("client_uid", data.clientUid)
        .order("received_at", { ascending: false })
        .limit(200),
      supabase
        .from("cs_calendly_events")
        .select(
          "id, name, status, start_time, end_time, invitee_name, invitee_email, meeting_url, user_id",
        )
        .eq("client_uid", data.clientUid)
        .order("start_time", { ascending: false })
        .limit(200),
    ]);

    let waMessages: {
      id: string;
      body: string | null;
      sender_type: string;
      sender_user_id: string | null;
      message_type: string;
      created_at: string;
      lead_id: string;
      phone?: string | null;
      contact_name?: string | null;
    }[] = [];
    if (phones.length > 0) {
      const { data: waContacts } = await supabase
        .from("whatsapp_contacts")
        .select("lead_id, phone, name")
        .in("phone", phones);
      const byLead = new Map<string, { phone: string; name: string | null }>();
      for (const c of waContacts ?? []) {
        if (c.lead_id) byLead.set(c.lead_id, { phone: c.phone, name: c.name ?? null });
      }
      const leadIds = Array.from(byLead.keys());
      if (leadIds.length > 0) {
        const { data: msgs } = await supabase
          .from("whatsapp_messages")
          .select("id, body, sender_type, sender_user_id, message_type, created_at, lead_id")
          .in("lead_id", leadIds)
          .order("created_at", { ascending: false })
          .limit(300);
        const nameByPhone = new Map(
          (contacts.data ?? [])
            .filter((c) => digits(c.whatsapp).length >= 8)
            .map((c) => [digits(c.whatsapp), c.nome] as const),
        );
        waMessages = (msgs ?? []).map((m) => {
          const info = byLead.get(m.lead_id);
          return {
            ...m,
            phone: info?.phone ?? null,
            contact_name: (info?.phone ? nameByPhone.get(info.phone) : null) ?? info?.name ?? null,
          };
        });
      }
    }

    const { getEvidenceConfig: getEvidence } = await import("@/lib/cs/cs-core.server");
    const [{ data: isManager }, evidenceCfg] = await Promise.all([
      supabase.rpc("is_manager", { _user_id: context.userId }),
      getEvidence(supabase),
    ]);

    return {
      isManager: Boolean(isManager),
      evidenceChannels: evidenceCfg.exigir_evidencia ? evidenceCfg.canais : [],
      client: client.data,
      contacts: contacts.data ?? [],
      tags: tags.data ?? [],
      snapshots: snaps.data ?? [],
      records: records.data ?? [],
      // Bloco 7: "se houve mudança de cor na semana seguinte" ao contato
      timeline: (timeline.data ?? []).map((ev) => {
        const meta = (ev.metadata ?? {}) as Record<string, unknown>;
        const st = meta["sinaleira"] as Record<string, unknown> | undefined;
        if (!st) return ev;
        const evWeek = mondayOfDate(new Date(ev.occurred_at));
        const next = (snaps.data ?? []).find((s) => s.week_start > evWeek);
        return {
          ...ev,
          metadata: { ...meta, sinaleira: { ...st, semana_seguinte: next?.signal ?? null } },
        };
      }),
      alerts: alerts.data ?? [],
      children: children.data ?? [],
      profiles: profiles.data ?? [],
      emails: emailsRes.data ?? [],
      agenda: agendaRes.data ?? [],
      whatsapp: waMessages,
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
        tipo_servico: z.enum(CS_SERVICE_TYPES).nullish(),
        tag_uso: z.enum(CS_TAG_USO).nullish(),
        diagnostico_causa: z
          .enum(["analista_novo", "falta_projeto", "nao_ve_valor", "outro"])
          .nullish(),
        pessoas_mapeadas: z.number().int().min(0).nullish(),
        produtos_ativos: z.array(z.string()).optional(),
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
      title:
        data.field === "cs_responsavel_id"
          ? "Responsável de CS alterado"
          : "Responsável comercial alterado",
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
        analista_pda: z.boolean().default(false),
        analista_certificado_em: z.string().nullish(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { id, ...fields } = data;
    if (id) {
      const { error } = await supabase
        .from("cs_contacts")
        .update(fields as never)
        .eq("id", id);
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
  .inputValidator((d) =>
    z.object({ clientUid: z.string().min(1), tag: z.string().min(1) }).parse(d),
  )
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
    const { addClientTag, logTimeline, recomputeHealth, tagForAgenda } =
      await import("@/lib/cs/cs-core.server");
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
    const engajou =
      data.cliente_autossuficiente ||
      data.whatsapp_answered === true ||
      data.contact_type === "agenda";

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
            sinaleira: z.number().min(0).max(100),
            agenda: z.number().min(0).max(100),
            whatsapp: z.number().min(0).max(100),
            proposta_aberta: z.number().min(0).max(100),
            masterclass: z.number().min(0).max(100),
            analista_pda: z.number().min(0).max(100),
          })
          .optional(),
        signalPoints: z
          .object({
            verde: z.number().min(0).max(100),
            amarelo: z.number().min(0).max(100),
            vermelho: z.number().min(0).max(100),
          })
          .optional(),
        options: z.object({ renormalizar_sem_sinaleira: z.boolean() }).optional(),
        dailyTarget: z.object({ contatos_por_dia: z.number().int().min(0).max(100) }).optional(),
        evidence: z
          .object({
            exigir_evidencia: z.boolean(),
            canais: z.array(z.enum(["email", "whatsapp", "ligacao", "reuniao", "outro"])),
            antecedencia_horas: z.number().int().min(0).max(720),
            retroativo_horas: z.number().int().min(1).max(720),
            gestor_pode_concluir: z.boolean(),
            conta_bot: z.boolean(),
            reuniao_exige_aceite: z.boolean().default(false),
          })
          .optional(),
        masterclass: z
          .object({
            modulos: z.array(
              z.object({
                id: z.number().int().min(1).max(20),
                nome: z.string().min(1).max(120),
                descricao: z.string().max(500),
                tag_uso: z.enum(["recrutamento", "desenvolvimento"]).optional(),
              }),
            ),
            regras: z.array(
              z.object({
                id: z.string().min(1),
                cor: z.enum(["verde", "amarelo", "vermelho", "qualquer"]),
                semanas_min: z.number().int().min(0).optional(),
                semanas_max: z.number().int().min(0).optional(),
                causa: z
                  .enum(["analista_novo", "falta_projeto", "nao_ve_valor", "outro"])
                  .optional(),
                mes_contrato: z.number().int().min(1).optional(),
                analista_novo_dias: z.number().int().min(1).optional(),
                modulos: z.array(z.number().int()),
                usar_tag_uso: z.boolean().optional(),
                motivo: z.string().max(200),
              }),
            ),
            sucesso: z.object({
              primeiro: z.object({
                modulos: z.array(z.number().int()),
                participacoes: z.number().int().min(1),
                usos: z.number().int().min(0),
              }),
              segundo: z.object({
                modulos: z.array(z.number().int()),
                participacoes: z.number().int().min(1),
                usos: z.number().int().min(0),
              }),
            }),
          })
          .optional(),
        escalation: z
          .object({
            dias_atraso: z.number().int().min(1).max(90),
            dias_sem_acao: z.number().int().min(0).max(90),
            criterio: z.enum(["qualquer", "atraso", "sem_acao", "ambos"]),
            notificar_email: z.boolean(),
            diretoria_emails: z.array(z.string().email()).default([]),
          })
          .optional(),
        features: z
          .object({
            reoferta_dias: z.number().int().min(1).max(730),
            recusa_dias: z.number().int().min(1).max(730),
            funcionalidades: z.array(
              z.object({
                id: z.string().min(1),
                nome: z.string().max(120),
                para_quem: z.string().max(300),
                tag_uso: z.array(z.string()),
                dias_min: z.number().int().min(0).optional(),
                sinaleiras: z.array(z.string()),
                verde_consolidado: z.boolean().optional(),
                pessoas_min: z.number().int().min(0).optional(),
                junto_modulo: z.number().int().min(1).optional(),
                nao_vermelho_inicial: z.boolean().optional(),
                resolve: z.string().max(400),
                gancho: z.string().max(400),
              }),
            ),
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
    if (data.signalPoints) await saveCsSetting(supabase, "health_signal_points", data.signalPoints);
    if (data.options) await saveCsSetting(supabase, "health_options", data.options);
    if (data.dailyTarget) await saveCsSetting(supabase, "daily_contact_target", data.dailyTarget);
    if (data.evidence) await saveCsSetting(supabase, "evidence", data.evidence);
    if (data.escalation) await saveCsSetting(supabase, "escalation", data.escalation);
    if (data.masterclass) await saveCsSetting(supabase, "masterclass", data.masterclass);
    if (data.features) await saveCsSetting(supabase, "features", data.features);
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
      let cs = row.cs_responsavel_email
        ? (emailToId.get(norm(row.cs_responsavel_email)) ?? null)
        : null;
      let comercial = row.comercial_responsavel_email
        ? (emailToId.get(norm(row.comercial_responsavel_email)) ?? null)
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
      if (row.parent_nome)
        parents.push({ child: inserted.client_uid, parentName: row.parent_nome });
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
      return {
        ok: false as const,
        tabs: [] as string[],
        latest: null,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  });

/* ------------------------------------------------------------------ */
/* Reuniões (cadastro manual, futuro vínculo com Calendly)            */
/* ------------------------------------------------------------------ */

/** Categorias de reunião + reuniões do cliente. */
export const listCsMeetings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ clientUid: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const [meetings, categories] = await Promise.all([
      context.supabase
        .from("cs_meetings")
        .select("*")
        .eq("client_uid", data.clientUid)
        .order("occurred_at", { ascending: false }),
      context.supabase.from("cs_meeting_categories").select("*").eq("ativo", true).order("name"),
    ]);
    if (meetings.error) throw new Error(meetings.error.message);
    return { meetings: meetings.data ?? [], categories: categories.data ?? [] };
  });

/** Cria/edita uma reunião e espelha na timeline do cliente. */
export const saveCsMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        clientUid: z.string().min(1),
        title: z.string().min(1),
        categoryId: z.string().uuid().nullable().optional(),
        occurredAt: z.string().min(1),
        durationMinutes: z.number().int().positive().nullable().optional(),
        status: z.enum(["realizada", "agendada", "cancelada", "no_show"]).default("realizada"),
        attendees: z.string().nullable().optional(),
        meetingUrl: z.string().nullable().optional(),
        summary: z.string().nullable().optional(),
        nextStep: z.string().nullable().optional(),
        nextStepAt: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const row = {
      client_uid: data.clientUid,
      title: data.title,
      category_id: data.categoryId ?? null,
      occurred_at: new Date(data.occurredAt).toISOString(),
      duration_minutes: data.durationMinutes ?? null,
      status: data.status,
      attendees: data.attendees || null,
      meeting_url: data.meetingUrl || null,
      summary: data.summary || null,
      next_step: data.nextStep || null,
      next_step_at: data.nextStepAt ? new Date(data.nextStepAt).toISOString() : null,
      owner_user_id: userId,
    };

    let meetingId = data.id ?? null;
    if (data.id) {
      const { error } = await supabase
        .from("cs_meetings")
        .update(row as never)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { data: created, error } = await supabase
        .from("cs_meetings")
        .insert({ ...row, created_by: userId, source: "manual" } as never)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      meetingId = (created as { id: string }).id;
    }

    await supabase.from("cs_timeline_events").insert({
      client_uid: data.clientUid,
      author_id: userId,
      event_type: "reuniao",
      channel: "reuniao",
      title: data.title,
      description: data.summary || null,
      occurred_at: row.occurred_at,
      metadata: { meeting_id: meetingId, status: data.status, category_id: row.category_id },
    } as never);

    if (data.status === "realizada") {
      await supabase
        .from("cs_clients")
        .update({ last_contact_at: row.occurred_at } as never)
        .eq("client_uid", data.clientUid);
    }

    return { ok: true, id: meetingId };
  });

export const deleteCsMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("cs_meetings").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Cria uma nova categoria de reunião (livre para o time). */
export const saveCsMeetingCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ name: z.string().min(2) }).parse(d))
  .handler(async ({ data, context }) => {
    const slug = data.name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    const { data: created, error } = await context.supabase
      .from("cs_meeting_categories")
      .upsert({ name: data.name, slug, created_by: context.userId } as never, {
        onConflict: "slug",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, category: created };
  });

/** Registro manual de atendimento direto na timeline (ligação, observação, etc). */
export const addCsTimelineEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        clientUid: z.string().min(1),
        channel: z.enum(["ligacao", "whatsapp", "email", "reuniao", "presencial", "observacao"]),
        title: z.string().min(1),
        description: z.string().nullable().optional(),
        occurredAt: z.string().optional(),
        countsAsContact: z.boolean().default(true),
        /** Bloco 10: as cinco perguntas do diagnóstico do vermelho + causa principal. */
        diagnostico: z
          .object({
            respostas: z.record(z.string(), z.enum(["sim", "nao", "na"])),
            causa: z.enum(["analista_novo", "falta_projeto", "nao_ve_valor", "outro"]).nullable(),
            observacao: z.string().max(2000).nullable().optional(),
          })
          .optional(),
        /** Bloco 8/10: acionar o Executivo com contexto (vira tarefa para ele). */
        executivo: z
          .object({
            projeto: z.string().min(1).max(300),
            contato: z.string().max(200).nullable().optional(),
            resumo: z.string().max(2000).nullable().optional(),
          })
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const occurredAt = data.occurredAt
      ? new Date(data.occurredAt).toISOString()
      : new Date().toISOString();
    const DIAG_Q: Record<string, string> = {
      q1: "Sabe que está usando pouco",
      q2: "Há projeto parado",
      q3: "Mudança de equipe / saiu o analista",
      q4: "Dúvida técnica acumulada",
      q5: "Ainda acredita no valor",
    };
    let description = data.description || null;
    if (data.diagnostico) {
      const linhas = Object.entries(data.diagnostico.respostas)
        .filter(([, v]) => v !== "na")
        .map(([k, v]) => `${DIAG_Q[k] ?? k}: ${v === "sim" ? "sim" : "não"}`);
      const { DIAG_CAUSE_LABEL } = await import("@/lib/cs/masterclass");
      const causa = data.diagnostico.causa ? DIAG_CAUSE_LABEL[data.diagnostico.causa] : null;
      description = [
        description,
        `Diagnóstico do vermelho — ${linhas.join(" · ") || "sem respostas"}${causa ? ` · Causa principal: ${causa}` : ""}`,
        data.diagnostico.observacao?.trim() || null,
      ]
        .filter(Boolean)
        .join("\n");
      if (data.diagnostico.causa)
        await supabase
          .from("cs_clients")
          .update({ diagnostico_causa: data.diagnostico.causa })
          .eq("client_uid", data.clientUid);
    }
    const { error } = await supabase.from("cs_timeline_events").insert({
      client_uid: data.clientUid,
      author_id: userId,
      event_type: "contato_manual",
      channel: data.channel,
      title: data.title,
      description,
      occurred_at: occurredAt,
      metadata: {
        manual: true,
        ...(data.diagnostico ? { diagnostico: data.diagnostico } : {}),
      },
    } as never);
    if (error) throw new Error(error.message);

    if (data.executivo) {
      const { data: client } = await supabase
        .from("cs_clients")
        .select("nome_empresa, comercial_responsavel_id")
        .eq("client_uid", data.clientUid)
        .maybeSingle();
      const notes = [
        `Projeto/oportunidade: ${data.executivo.projeto}`,
        data.executivo.contato ? `Contato no cliente: ${data.executivo.contato}` : null,
        data.executivo.resumo ? `Última conversa: ${data.executivo.resumo}` : null,
      ]
        .filter(Boolean)
        .join("\n");
      await supabase.from("cs_tasks").insert({
        client_uid: data.clientUid,
        owner_id: client?.comercial_responsavel_id ?? null,
        title:
          `Acionamento do CS — ${client?.nome_empresa ?? data.clientUid}: ${data.executivo.projeto}`.slice(
            0,
            200,
          ),
        task_type: "outro",
        due_at: new Date(Date.now() + 2 * 86400000).toISOString(),
        notes,
        created_by: userId,
        source: "acionamento_executivo",
      });
      await supabase.from("cs_timeline_events").insert({
        client_uid: data.clientUid,
        author_id: userId,
        event_type: "acionamento_executivo",
        channel: "observacao",
        title: `Executivo acionado: ${data.executivo.projeto}`.slice(0, 180),
        description: notes,
        occurred_at: occurredAt,
        metadata: { executivo_id: client?.comercial_responsavel_id ?? null },
      } as never);
    }

    // Registro com data futura é agendamento (aparece em Follow-ups CS), não contato feito.
    const isFuture = occurredAt > new Date().toISOString();
    if (data.countsAsContact && data.channel !== "observacao" && !isFuture) {
      await supabase
        .from("cs_clients")
        .update({ last_contact_at: occurredAt } as never)
        .eq("client_uid", data.clientUid);
    }
    return { ok: true };
  });

/** Dados da página Início: quem sou, minha carteira, alertas abertos e atividade recente. */
export const getCsHome = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { getDailyTarget } = await import("@/lib/cs/cs-core.server");
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [profile, clients, alerts, events, profiles, todayEvents, dailyTarget] =
      await Promise.all([
        supabase.from("profiles").select("full_name, email").eq("id", userId).maybeSingle(),
        supabase
          .from("cs_clients")
          .select(
            "client_uid, nome_empresa, current_signal, health_score, cs_responsavel_id, comercial_responsavel_id",
          )
          .eq("ativo", true),
        supabase
          .from("cs_alerts")
          .select("id, client_uid, alert_type, reason, severity, created_at")
          .eq("status", "open")
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("cs_timeline_events")
          .select("id, client_uid, event_type, channel, title, description, author_id, occurred_at")
          .order("occurred_at", { ascending: false })
          .limit(30),
        supabase.from("profiles").select("id, full_name, email"),
        supabase
          .from("cs_timeline_events")
          .select("id, channel")
          .eq("author_id", userId)
          .gte("occurred_at", startOfDay.toISOString())
          .in("channel", ["ligacao", "whatsapp", "email", "reuniao", "presencial"]),
        getDailyTarget(supabase),
      ]);

    const all = clients.data ?? [];
    const names = new Map(all.map((c) => [c.client_uid, c.nome_empresa]));
    const mine = all.filter(
      (c) => c.cs_responsavel_id === userId || c.comercial_responsavel_id === userId,
    );
    const mineSet = new Set(mine.map((c) => c.client_uid));
    const openAlerts = alerts.data ?? [];

    return {
      me: { id: userId, name: profile.data?.full_name || profile.data?.email || "" },
      contatosHoje: (todayEvents.data ?? []).length,
      metaDiaria: dailyTarget.contatos_por_dia,
      carteira: {
        total: all.length,
        mine: mine.length,
        mineRed: mine.filter((c) => c.current_signal === "vermelho").length,
        alertsOpen: openAlerts.length,
        alertsMine: openAlerts.filter((a) => mineSet.has(a.client_uid)).length,
      },
      alerts: openAlerts.map((a) => ({
        ...a,
        clientName: names.get(a.client_uid) ?? a.client_uid,
        mine: mineSet.has(a.client_uid),
      })),
      events: (events.data ?? []).map((e) => ({
        ...e,
        clientName: names.get(e.client_uid) ?? e.client_uid,
      })),
      profiles: profiles.data ?? [],
    };
  });

/** Delegações de carteira (cobertura de férias/afastamento). Gestão vê todas; analista vê as suas. */
export const listCsDelegations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("cs_delegations")
      .select("*")
      .order("starts_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const saveCsDelegation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        from_user_id: z.string().uuid(),
        to_user_id: z.string().uuid(),
        starts_at: z.string().min(10),
        ends_at: z.string().nullish(),
        reason: z.string().nullish(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.from_user_id === data.to_user_id)
      throw new Error("Origem e destino precisam ser pessoas diferentes");
    const { id, ...fields } = data;
    if (id) {
      const { error } = await supabase
        .from("cs_delegations")
        .update(fields as never)
        .eq("id", id);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: created, error } = await supabase
      .from("cs_delegations")
      .insert({ ...fields, created_by: userId } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: created.id };
  });

export const deleteCsDelegation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("cs_delegations").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
