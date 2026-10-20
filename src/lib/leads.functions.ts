import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { calculateScore, type IcpRules, type IcpThresholds } from "./icp-score";
import { notifyNewLead } from "./lead-notify.server";
import { normalizeLeadType } from "./lead-type";

/** Lista leads + stages + perfis (para o Kanban). */
export const listKanbanData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        de: z.string().optional(),
        ate: z.string().optional(),
        busca: z.string().max(120).optional(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { de, ate, busca } = data ?? {};
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
    /*
     * O kanban parou de carregar quando a base cresceu, e a culpa era daqui.
     *
     * A versão anterior contava os leads, dividia por mil e disparava TODAS as
     * páginas de uma vez — até cinquenta requisições simultâneas de mil linhas
     * com quarenta colunas cada. Numa instância pequena isso não volta: o banco
     * engasga, o React tenta de novo, e a tela fica em "Carregando…" para
     * sempre.
     *
     * O quadro agora carrega por coluna, com teto. Uma coluna de kanban com
     * mais de algumas centenas de cards já não é rolável por ninguém, então o
     * teto não tira nada que alguém fosse ler — e o que ele garante é que o
     * peso da tela pare de crescer junto com a base. A contagem de cada coluna
     * continua sendo a real, vinda do banco, não o tamanho do que coube.
     */
    const TETO_POR_COLUNA = 250;
    const SIMULTANEAS = 3;

    const stagesRes = await supabase.from("stages").select("*").order("position");
    if (stagesRes.error) throw new Error(stagesRes.error.message);
    const stages = (stagesRes.data ?? []) as Array<{ id: string; position: number }>;

    async function emLotes<T>(tarefas: Array<() => Promise<T>>): Promise<T[]> {
      const saida: T[] = [];
      for (let i = 0; i < tarefas.length; i += SIMULTANEAS) {
        const lote = tarefas.slice(i, i + SIMULTANEAS).map((t) => t());
        saida.push(...(await Promise.all(lote)));
      }
      return saida;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type Recorte = (q: any) => any;

    /*
     * O filtro de período vai para o banco, não para o navegador.
     *
     * Enquanto ele era aplicado no cliente, só peneirava os cards que tinham
     * cabido no teto da coluna — ou seja, filtrar setembro numa coluna de mil
     * leads devolvia o nada, porque os mil mais recentes já eram de outubro.
     * O número no topo da coluna também não mudava, que foi como o problema
     * apareceu.
     *
     * Aqui a faixa é deliberadamente mais larga do que a da tela: pega o lead
     * se QUALQUER uma das três datas cair no período (criação, conversão, ou o
     * submitted_at do formulário, que é o que muda numa reconversão), e sobra
     * um dia de cada lado porque a tela raciocina em horário de Brasília e o
     * banco em UTC. O corte exato continua sendo feito no cliente, sobre esse
     * conjunto maior — superconjunto no servidor, precisão na tela.
     */
    function diaEmIso(dia: string, deslocamento: number) {
      const t = new Date(`${dia}T00:00:00Z`).getTime() + deslocamento * 86_400_000;
      return new Date(t).toISOString();
    }
    const inicio = de ? diaEmIso(de, -1) : "1970-01-01T00:00:00.000Z";
    const fim = ate ? diaEmIso(ate, 2) : "2999-12-31T00:00:00.000Z";
    const CAMPOS_DE_DATA = ["created_at", "converted_at", "form_payload->>submitted_at"];
    const recorteDeData: Recorte = (q) =>
      !de && !ate
        ? q
        : q.or(CAMPOS_DE_DATA.map((c) => `and(${c}.gte.${inicio},${c}.lte.${fim})`).join(","));

    /*
     * O form_payload fica no servidor.
     *
     * Ele é o campo mais gordo do lead — o formulário inteiro do Meta, os ids
     * da campanha e o histórico de reconversões — e multiplicado por milhares
     * de cards estourou o limite de serialização da função de servidor: a tela
     * voltava com "exceeded its pending output limit". Buscar do banco é
     * barato; mandar ao navegador é que não é. Então o que o quadro usa sai
     * calculado daqui, em quatro campos pequenos, e o blob fica para trás.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function enxugarLead(lead: any) {
      const { form_payload, ...resto } = lead;
      const payload = (form_payload ?? null) as Record<string, unknown> | null;
      const textos = payload
        ? Object.values(payload).filter((v): v is string => typeof v === "string")
        : [];
      return {
        ...resto,
        form_lead_type: (payload?.lead_type as string | null) ?? null,
        form_submitted_at: (payload?.submitted_at as string | null) ?? null,
        // O card marca lead de certificação varrendo o formulário inteiro;
        // a varredura passa a acontecer aqui, e só o sim ou não viaja.
        form_certificacao: textos.some((v) => /certifica/i.test(v)),
        // Os poucos campos que o card expandido mostra, cortados no tamanho.
        form_resumo: payload
          ? Object.entries(payload)
              .filter(([, v]) => v != null && v !== "" && typeof v !== "object")
              .slice(0, 6)
              .map(([k, v]) => [k, String(v).slice(0, 80)] as [string, string])
          : [],
      };
    }

    async function colunaDeLeads(chave: string, recorte: Recorte) {
      const [contagem, pagina] = await Promise.all([
        recorte(
          recorteDeData(
            supabase.from("leads").select("id", { count: "exact", head: true }).or(filter),
          ),
        ),
        recorte(recorteDeData(supabase.from("leads").select(KANBAN_COLUMNS).or(filter)))
          /*
           * O desempate por id é obrigatório: created_at repete (a sync da
           * planilha grava lotes inteiros com o mesmo instante) e, sem uma
           * chave única na ordenação, duas leituras devolvem conjuntos
           * diferentes.
           */
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
          .limit(TETO_POR_COLUNA),
      ]);
      if (pagina.error) throw new Error(pagina.error.message);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const linhas = ((pagina.data ?? []) as any[]).map(enxugarLead);
      return { chave, linhas, total: contagem.count ?? linhas.length };
    }

    const colunas = await emLotes([
      // Lead sem etapa entra junto: fora dos recortes ele sumiria do quadro.
      () => colunaDeLeads("__sem_etapa", (q) => q.is("stage_id", null)),
      ...stages.map((e) => () => colunaDeLeads(e.id, (q) => q.eq("stage_id", e.id))),
    ]);

    const leads = colunas.flatMap((c) => c.linhas);

    /*
     * A busca do topo vai ao banco.
     *
     * Cada coluna traz só os 250 cards mais recentes, e a busca filtrava o que
     * tinha cabido no quadro: um lead que existia, mas estava fora do teto,
     * dava "0 leads" — parecia que não tinha entrado. Agora quem bate com o
     * texto vem do banco e se junta ao quadro, esteja onde estiver.
     */
    const termo = (busca ?? "").replace(/[,()*%\\]/g, " ").trim();
    if (termo.length >= 3) {
      const padrao = `*${termo}*`;
      const { data: achados, error: erroBusca } = await supabase
        .from("leads")
        .select(KANBAN_COLUMNS)
        .or(filter)
        .or(["name", "email", "company_name", "phone"].map((c) => `${c}.ilike.${padrao}`).join(","))
        .order("created_at", { ascending: false })
        .limit(100);
      if (erroBusca) throw new Error(erroBusca.message);
      const jaNoQuadro = new Set(leads.map((l) => l.id as string));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const l of (achados ?? []) as any[]) {
        if (!jaNoQuadro.has(l.id)) leads.push(enxugarLead(l));
      }
    }
    const totalPorEtapa: Record<string, number> = {};
    let cardsOmitidos = 0;
    for (const c of colunas) {
      totalPorEtapa[c.chave] = c.total;
      cardsOmitidos += Math.max(c.total - c.linhas.length, 0);
    }

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
      /*
       * A contagem real de cada coluna e quantos cards ficaram fora do teto.
       * Esconder em silêncio é o que já custou caro aqui antes.
       */
      totalPorEtapa,
      cardsOmitidos,
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
