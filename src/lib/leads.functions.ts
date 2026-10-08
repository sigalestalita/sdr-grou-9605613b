import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { calculateScore, type IcpRules, type IcpThresholds } from "./icp-score";
import { notifyNewLead } from "./lead-notify.server";
import { normalizeLeadType } from "./lead-type";

/** Lista leads + stages + perfis (para o Kanban). */
export const listKanbanData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const PAGE = 1000;
    // Só as colunas que o Kanban usa: os campos longos (BANT, resumo da
    // empresa, sinais de ICP, dor provável) ficam para a página do lead.
    const KANBAN_COLUMNS =
      "id, name, email, phone, company_name, company_segment, company_size, company_website, linkedin_url, position, stage_id, stage_entered_at, priority, score, source, campaign, ad_name, lead_type, assigned_to, enrichment_status, converted_at, created_at, meeting_at, next_follow_up_at, last_touch_at, last_touch_channel, last_touch_outcome, touch_count, lost_reason, demo_free, cadence_track, cadence_status, cadence_started_at, first_approach_at, linkedin_company_size, meeting_booked_at, executivo_id, form_payload, meeting_invite_sent_at, meeting_duration_min";
    const filter = "source.is.null,source.neq.campaign_upload";

    /*
     * O kanban parou de carregar quando a base cresceu, e a culpa era daqui.
     *
     * A versão anterior contava os leads, dividia por mil e disparava TODAS as
     * páginas de uma vez — até cinquenta requisições simultâneas de mil linhas
     * com quarenta colunas cada. Numa instância pequena isso não volta: o banco
     * engasga, o React tenta de novo, e a tela fica em "Carregando…" para
     * sempre.
     *
     * Agora são duas mudanças. As páginas vão de três em três, então o banco
     * nunca recebe a enxurrada. E etapa terminal — desqualificado, ganho,
     * perdido — entra com teto: é histórico que ninguém rola no quadro, e é
     * onde o volume se acumula. Etapa aberta continua vindo inteira, porque é
     * o funil em que a SDR trabalha e dali não pode faltar ninguém.
     */
    const TETO_DE_TERMINAIS = 1500;
    const SIMULTANEAS = 3;

    const stagesRes = await supabase.from("stages").select("*").order("position");
    if (stagesRes.error) throw new Error(stagesRes.error.message);
    const stages = (stagesRes.data ?? []) as Array<{ id: string; is_terminal: boolean }>;
    const idsTerminais = stages.filter((e) => e.is_terminal).map((e) => e.id);
    const idsAbertas = stages.filter((e) => !e.is_terminal).map((e) => e.id);

    async function emLotes<T>(tarefas: Array<() => Promise<T>>): Promise<T[]> {
      const saida: T[] = [];
      for (let i = 0; i < tarefas.length; i += SIMULTANEAS) {
        const lote = tarefas.slice(i, i + SIMULTANEAS).map((t) => t());
        saida.push(...(await Promise.all(lote)));
      }
      return saida;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type Consulta = (q: any) => any;

    async function buscarLeads(recorte: Consulta, teto: number | null) {
      const { count, error: countErr } = await recorte(
        supabase.from("leads").select("id", { count: "exact", head: true }).or(filter),
      );
      if (countErr) throw new Error(countErr.message);
      const total = count ?? 0;
      const aBuscar = teto === null ? total : Math.min(total, teto);
      const paginas = Math.ceil(aBuscar / PAGE);
      const partes = await emLotes(
        Array.from({ length: paginas }, (_, i) => async () => {
          const { data, error } = await recorte(
            supabase
              .from("leads")
              .select(KANBAN_COLUMNS)
              .or(filter)
              /*
               * O desempate por id é obrigatório: created_at repete (a sync da
               * planilha grava lotes inteiros com o mesmo instante) e, sem uma
               * chave única na ordenação, as páginas repetem umas linhas e
               * perdem outras.
               */
              .order("created_at", { ascending: false })
              .order("id", { ascending: true })
              .range(i * PAGE, Math.min((i + 1) * PAGE, aBuscar) - 1),
          );
          if (error) throw new Error(error.message);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (data ?? []) as any[];
        }),
      );
      return { linhas: partes.flat(), total };
    }

    // Lead sem etapa entra junto com as abertas: fora dos dois recortes, ele
    // simplesmente desapareceria do quadro.
    const recorteAbertas: Consulta = (q) =>
      idsAbertas.length > 0
        ? q.or(`stage_id.is.null,stage_id.in.(${idsAbertas.join(",")})`)
        : q.is("stage_id", null);
    const recorteTerminais: Consulta = (q) => q.in("stage_id", idsTerminais);

    const abertas = await buscarLeads(recorteAbertas, null);
    const terminais =
      idsTerminais.length > 0
        ? await buscarLeads(recorteTerminais, TETO_DE_TERMINAIS)
        : { linhas: [], total: 0 };
    const leads = [...abertas.linhas, ...terminais.linhas];

    const [profilesRes, rolesRes, conversasRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name, email"),
      supabase.from("user_roles").select("user_id").eq("role", "executivo"),
      /*
       * Só o estado da conversa, para o card dizer de quem é a bola: com a IA
       * ou com uma pessoa. Nada de mensagem aqui — o kanban carrega milhares de
       * leads e não pode pagar por isso.
       */
      supabase
        .from("whatsapp_conversations")
        .select("id, lead_id, status, assumed_at")
        .not("lead_id", "is", null)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(3000),
    ]);
    if (profilesRes.error) throw new Error(profilesRes.error.message);
    /*
     * O kanban carrega milhares de leads, então aqui não se pergunta pelas
     * mensagens: o selo sai de status e assumed_at, que já vêm na consulta das
     * conversas. Quem envia pelo inbox passa a ser dono da conversa, e o
     * histórico foi preenchido pela migration do assumed_at retroativo.
     */
    const conversaPorLead = new Map<
      string,
      { status: string | null; assumed_at: string | null; tem_mensagem_humana: boolean }
    >();
    for (const c of (conversasRes.data ?? []) as Array<{
      id: string;
      lead_id: string | null;
      status: string | null;
      assumed_at: string | null;
    }>) {
      // A consulta vem da mais recente para a mais antiga: a primeira de cada
      // lead é a que vale.
      if (c.lead_id && !conversaPorLead.has(c.lead_id)) {
        conversaPorLead.set(c.lead_id, {
          status: c.status,
          assumed_at: c.assumed_at,
          tem_mensagem_humana: false,
        });
      }
    }

    return {
      stages: stagesRes.data ?? [],
      leads,
      /*
       * O que ficou de fora, para a tela poder dizer. Esconder em silêncio é o
       * que já custou caro aqui antes.
       */
      historicoOmitido: Math.max(terminais.total - terminais.linhas.length, 0),
      conversas: Object.fromEntries(conversaPorLead),
      profiles: profilesRes.data ?? [],
      /** Quem pode ser o executivo da agenda (papel executivo). */
      executivoIds: (rolesRes.data ?? []).map((r) => r.user_id as string),
    };
  });

export const getLeadDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [leadRes, notesRes, interactionsRes, stagesRes, profilesRes, rolesRes] =
      await Promise.all([
        supabase.from("leads").select("*").eq("id", data.id).maybeSingle(),
        supabase
          .from("lead_notes")
          .select("*")
          .eq("lead_id", data.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("lead_interactions")
          .select("*")
          .eq("lead_id", data.id)
          .order("created_at", { ascending: false }),
        supabase.from("stages").select("*").order("position"),
        supabase.from("profiles").select("id, full_name, email"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
    if (leadRes.error) throw new Error(leadRes.error.message);
    if (!leadRes.data) throw new Error("Lead não encontrado");
    if (rolesRes.error) throw new Error(rolesRes.error.message);
    const sdrUserIds = Array.from(
      new Set(
        (rolesRes.data ?? [])
          .filter((roleRow) => roleRow.role === "sdr")
          .map((roleRow) => roleRow.user_id as string),
      ),
    );

    return {
      lead: leadRes.data,
      notes: notesRes.data ?? [],
      interactions: interactionsRes.data ?? [],
      stages: stagesRes.data ?? [],
      profiles: profilesRes.data ?? [],
      sdrUserIds,
    };
  });

export const registerLeadCardOpen = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ leadId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("lead_interactions").insert({
      lead_id: data.leadId,
      author_id: userId,
      type: "card_opened",
      content: "Card do lead aberto",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const moveLeadStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ leadId: z.string().uuid(), stageId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const nowIso = new Date().toISOString();
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("stage_id, first_approach_at")
      .eq("id", data.leadId)
      .maybeSingle();
    if (leadError) throw new Error(leadError.message);
    if (lead?.stage_id === data.stageId) return { ok: true };

    const stageIds = [lead?.stage_id, data.stageId].filter((value): value is string => !!value);
    const { data: stagesData, error: stagesError } = stageIds.length
      ? await supabase.from("stages").select("id, slug, name").in("id", stageIds)
      : { data: [], error: null };
    if (stagesError) throw new Error(stagesError.message);

    const stagesById = new Map((stagesData ?? []).map((stage) => [stage.id, stage]));
    const previousStage = lead?.stage_id ? stagesById.get(lead.stage_id) : null;
    const nextStage = stagesById.get(data.stageId) ?? null;

    const patch: Record<string, unknown> = {
      stage_id: data.stageId,
      last_action_at: nowIso,
      stage_entered_at: nowIso,
    };
    if (nextStage?.slug === "em_contato" && !lead?.first_approach_at) {
      patch.first_approach_at = nowIso;
    }

    const { error } = await supabase
      .from("leads")
      .update(patch as never)
      .eq("id", data.leadId);
    if (error) throw new Error(error.message);

    const { error: interactionError } = await supabase.from("lead_interactions").insert({
      lead_id: data.leadId,
      author_id: userId,
      type: "status_change",
      content: previousStage?.name
        ? `Movido de "${previousStage.name}" para "${nextStage?.name ?? "etapa"}"`
        : `Movido para "${nextStage?.name ?? "etapa"}"`,
      metadata: {
        from_stage_id: previousStage?.id ?? null,
        from_stage_name: previousStage?.name ?? null,
        to_stage_id: nextStage?.id ?? data.stageId,
        to_stage_name: nextStage?.name ?? null,
        to_stage_slug: nextStage?.slug ?? null,
      },
    });
    if (interactionError) throw new Error(interactionError.message);

    return { ok: true };
  });

export const updateLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        patch: z.record(z.string(), z.unknown()),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const allowed: Record<string, unknown> = {};
    const allowedKeys = [
      "name",
      "email",
      "phone",
      "position",
      "linkedin_url",
      "company_name",
      "company_website",
      "company_linkedin",
      "company_description",
      "company_segment",
      "company_size",
      "linkedin_company_size",
      "company_location",
      "company_summary",
      "probable_pain",
      "next_action",
      "approach_result",
      "assigned_to",
      "lead_type",
      "stage_id",
      "meeting_at",
      "executivo_id",
      "lost_reason",
      "demo_free",
    ];
    for (const k of allowedKeys) {
      if (k in data.patch) allowed[k] = data.patch[k];
    }
    const nowIso = new Date().toISOString();
    const hasAssignedToPatch = Object.prototype.hasOwnProperty.call(allowed, "assigned_to");
    const hasStagePatch = Object.prototype.hasOwnProperty.call(allowed, "stage_id");
    let currentLead: {
      stage_id: string | null;
      first_approach_at: string | null;
    } | null = null;
    if (hasAssignedToPatch || hasStagePatch) {
      const { data: currentLeadData, error: currentLeadError } = await supabase
        .from("leads")
        .select("stage_id, first_approach_at")
        .eq("id", data.id)
        .maybeSingle();
      if (currentLeadError) throw new Error(currentLeadError.message);
      currentLead = currentLeadData;
    }

    let stageChange: {
      fromStageId: string | null;
      fromStageName: string | null;
      toStageId: string | null;
      toStageName: string | null;
      toStageSlug: string | null;
    } | null = null;

    if (hasStagePatch) {
      const previousStageId = currentLead?.stage_id ?? null;
      const nextStageId = typeof allowed.stage_id === "string" ? allowed.stage_id : null;

      if (nextStageId !== previousStageId) {
        const stageIds = [previousStageId, nextStageId].filter((value): value is string => !!value);
        const { data: stagesData, error: stagesError } = stageIds.length
          ? await supabase.from("stages").select("id, name, slug").in("id", stageIds)
          : { data: [], error: null };
        if (stagesError) throw new Error(stagesError.message);

        const stagesById = new Map((stagesData ?? []).map((stage) => [stage.id, stage]));
        const previousStage = previousStageId ? stagesById.get(previousStageId) : null;
        const nextStage = nextStageId ? stagesById.get(nextStageId) : null;

        allowed.stage_entered_at =
          typeof data.patch.stage_entered_at === "string" ? data.patch.stage_entered_at : nowIso;

        if (nextStage?.slug === "em_contato" && !currentLead?.first_approach_at) {
          allowed.first_approach_at = nowIso;
        }

        stageChange = {
          fromStageId: previousStage?.id ?? previousStageId,
          fromStageName: previousStage?.name ?? null,
          toStageId: nextStage?.id ?? nextStageId,
          toStageName: nextStage?.name ?? null,
          toStageSlug: nextStage?.slug ?? null,
        };
      }
    }

    allowed.last_action_at = nowIso;

    const { error } = await supabase
      .from("leads")
      .update(allowed as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    if (stageChange) {
      const { error: stageInteractionError } = await supabase.from("lead_interactions").insert({
        lead_id: data.id,
        author_id: userId,
        type: "status_change",
        content: stageChange.fromStageName
          ? `Movido de "${stageChange.fromStageName}" para "${stageChange.toStageName ?? "etapa"}"`
          : `Movido para "${stageChange.toStageName ?? "etapa"}"`,
        metadata: {
          from_stage_id: stageChange.fromStageId,
          from_stage_name: stageChange.fromStageName,
          to_stage_id: stageChange.toStageId,
          to_stage_name: stageChange.toStageName,
          to_stage_slug: stageChange.toStageSlug,
        },
      });
      if (stageInteractionError) throw new Error(stageInteractionError.message);
    }

    if (hasAssignedToPatch) {
      const { error: convError } = await supabase
        .from("whatsapp_conversations")
        .update({ assigned_user_id: (allowed.assigned_to as string | null | undefined) ?? null })
        .eq("lead_id", data.id);
      if (convError) throw new Error(convError.message);

      await supabase.from("lead_interactions").insert({
        lead_id: data.id,
        author_id: userId,
        type: "routing",
        content: allowed.assigned_to
          ? "Responsável do lead alterado manualmente."
          : "Lead enviado para fila geral.",
        metadata: {
          assignee_user_id: allowed.assigned_to ? String(allowed.assigned_to) : null,
          source: "lead_update",
        },
      });
    } else if (Object.prototype.hasOwnProperty.call(allowed, "lead_type")) {
      const { ensureLeadRouted } = await import("./lead-routing.server");
      await ensureLeadRouted({ supabase, leadId: data.id, actorUserId: userId });
    }

    return { ok: true };
  });

export const addLeadNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ leadId: z.string().uuid(), content: z.string().min(1).max(2000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("lead_notes").insert({
      lead_id: data.leadId,
      author_id: userId,
      content: data.content,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const recalcLeadScore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: lead } = await supabase.from("leads").select("*").eq("id", data.id).maybeSingle();
    if (!lead) throw new Error("Lead não encontrado");
    const { data: icp } = await supabase
      .from("icp_config")
      .select("*")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    const rules = (icp?.rules ?? {}) as unknown as IcpRules;
    const thresholds = (icp?.thresholds ?? {
      high: 70,
      medium: 40,
      low: 15,
    }) as unknown as IcpThresholds;
    const { score, priority, signals } = calculateScore(lead, rules, thresholds);
    await supabase
      .from("leads")
      .update({ score, priority, icp_signals: signals as never })
      .eq("id", data.id);
    try {
      const { maybeAlertHotLead } = await import("./lead-hot-alert.server");
      await maybeAlertHotLead(data.id);
    } catch {
      /* alerts must never break score recalc */
    }
    return { score, priority };
  });

export const createManualLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        name: z.string().min(1).max(200),
        email: z.string().email().optional().or(z.literal("")),
        phone: z.string().max(50).optional().or(z.literal("")),
        company_name: z.string().max(200).optional().or(z.literal("")),
        position: z.string().max(200).optional().or(z.literal("")),
        source: z.string().max(100).optional().or(z.literal("")),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: stage } = await supabase
      .from("stages")
      .select("id")
      .eq("slug", "novo")
      .maybeSingle();
    const email = data.email?.trim().toLowerCase() || null;
    if (email) {
      const { data: existing } = await supabase
        .from("leads")
        .select("id, name")
        .eq("email", email)
        .maybeSingle();
      if (existing) {
        throw new Error(
          `Já existe um lead cadastrado com o e-mail ${email}${existing.name ? ` (${existing.name})` : ""}.`,
        );
      }
    }
    const { data: inserted, error } = await supabase
      .from("leads")
      .insert({
        name: data.name,
        email,
        phone: data.phone || null,
        company_name: data.company_name || null,
        position: data.position || null,
        source: data.source || "manual",
        stage_id: stage?.id ?? null,
        last_action_at: new Date().toISOString(),
      })
      .select("id, name, company_name, lead_type, score, priority")
      .single();
    if (error) {
      if (error.code === "23505" && error.message.includes("leads_email_unique")) {
        throw new Error(`Já existe um lead cadastrado com o e-mail ${email ?? ""}.`.trim());
      }
      throw new Error(error.message);
    }
    const { ensureLeadRouted } = await import("./lead-routing.server");
    await ensureLeadRouted({ supabase, leadId: inserted.id });
    await notifyNewLead({
      id: inserted.id,
      name: inserted.name,
      company_name: inserted.company_name,
      lead_type: normalizeLeadType(inserted.lead_type),
      score: inserted.score,
      priority: inserted.priority,
    });
    return { id: inserted.id };
  });
