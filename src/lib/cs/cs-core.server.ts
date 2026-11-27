import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { DEFAULT_MASTERCLASS_CONFIG, type MasterclassConfig } from "@/lib/cs/masterclass";
import { DEFAULT_JOURNEY_CONFIG, type JourneyConfig } from "@/lib/cs/journey";
import { montarEntradaDeSaude, type EventoParaSaude } from "@/lib/cs/saude";
import {
  CS_AGENDA_TAG,
  DEFAULT_HEALTH_WEIGHTS,
  DEFAULT_ROUTING,
  DEFAULT_STAGE_SLA,
  analyzeSignalTrend,
  computeHealthScore,
  lastNWeeks,
  type CsSignal,
  type HealthWeights,
  type RoutingConfig,
  type StageSla,
  DEFAULT_HEALTH_SIGNAL_POINTS,
  DEFAULT_HEALTH_OPTIONS,
  DEFAULT_DAILY_TARGET,
  DEFAULT_EVIDENCE_CONFIG,
  employeesOf,
  DEFAULT_ESCALATION_CONFIG,
  type EscalationConfig,
  type EvidenceConfig,
  type HealthSignalPoints,
  type HealthOptions,
  type DailyTarget,
} from "@/lib/cs-types";

type DB = SupabaseClient<Database>;

/** Busca todas as linhas de uma query, contornando o limite de 1000 do Data API. */
export async function fetchAllRows<T>(
  build: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < 100; page++) {
    const from = page * pageSize;
    let result: Awaited<ReturnType<typeof build>> | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      result = await build(from, from + pageSize - 1);
      if (!result.error) break;
      const transient = /schema cache|statement timeout|connection|fetch failed/i.test(
        result.error.message,
      );
      if (!transient || attempt === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
    const { data, error } = result ?? {
      data: null,
      error: { message: "Falha ao consultar dados" },
    };
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

export async function getCsSetting<T>(db: DB, key: string, fallback: T): Promise<T> {
  const { data } = await db.from("cs_settings").select("value").eq("key", key).maybeSingle();
  if (!data?.value) return fallback;
  return { ...(fallback as object), ...(data.value as object) } as T;
}

/** Início da operação do CS (ISO da meia-noite de Brasília), ou null. */
export async function getInicioOperacao(db: DB): Promise<string | null> {
  const { CHAVE_INICIO_OPERACAO, lerInicioOperacao, inicioIso } =
    await import("@/lib/cs/inicio-operacao");
  return inicioIso(lerInicioOperacao(await getCsSetting<unknown>(db, CHAVE_INICIO_OPERACAO, null)));
}

export async function saveCsSetting(db: DB, key: string, value: unknown) {
  const { error } = await db
    .from("cs_settings")
    .upsert({ key, value: value as never, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
}

export function getHealthWeights(db: DB) {
  return getCsSetting<HealthWeights>(db, "health_weights", DEFAULT_HEALTH_WEIGHTS);
}
export function getHealthSignalPoints(db: DB) {
  return getCsSetting<HealthSignalPoints>(db, "health_signal_points", DEFAULT_HEALTH_SIGNAL_POINTS);
}
export function getHealthOptions(db: DB) {
  return getCsSetting<HealthOptions>(db, "health_options", DEFAULT_HEALTH_OPTIONS);
}
export function getDailyTarget(db: DB) {
  return getCsSetting<DailyTarget>(db, "daily_contact_target", DEFAULT_DAILY_TARGET);
}
export function getEvidenceConfig(db: DB) {
  return getCsSetting<EvidenceConfig>(db, "evidence", DEFAULT_EVIDENCE_CONFIG);
}
export function getMasterclassConfig(db: DB) {
  return getCsSetting<MasterclassConfig>(db, "masterclass", DEFAULT_MASTERCLASS_CONFIG);
}
export function getJourneyConfigDb(db: DB) {
  return getCsSetting<JourneyConfig>(db, "journey_emails", DEFAULT_JOURNEY_CONFIG);
}
export function getEscalationConfig(db: DB) {
  return getCsSetting<EscalationConfig>(db, "escalation", DEFAULT_ESCALATION_CONFIG);
}
export function getStageSla(db: DB) {
  return getCsSetting<StageSla>(db, "stage_sla_days", DEFAULT_STAGE_SLA);
}
export function getRouting(db: DB) {
  return getCsSetting<RoutingConfig>(db, "routing", DEFAULT_ROUTING);
}

/** Regras de roteamento por tipo/origem/porte. Fixo no momento da entrada do cliente. */
export async function resolveCsRouting(
  db: DB,
  input: {
    tipo_lead: string;
    origem: string;
    /** Faixa de porte do RD e/ou nº de funcionários — decide CS × pool de executivos. */
    porte?: string | null;
    num_funcionarios?: number | null;
    comercial_fechou?: string | null;
  },
): Promise<{ cs_responsavel_id: string | null; comercial_responsavel_id: string | null }> {
  const routing = await getRouting(db);

  if (input.tipo_lead === "consultoria") {
    return {
      cs_responsavel_id: routing.consultoria_cs,
      comercial_responsavel_id: input.comercial_fechou ?? null,
    };
  }

  if (input.origem === "renovacao") {
    return {
      cs_responsavel_id: routing.renovacao_cs,
      comercial_responsavel_id: pickFrom(routing.comercial_high, routing.rr_cursor),
    };
  }

  const pool = routing.cs_round_robin ?? [];
  const cs = pickFrom(pool, routing.rr_cursor);
  if (pool.length > 0) {
    await saveCsSetting(db, "routing", {
      ...routing,
      rr_cursor: (routing.rr_cursor + 1) % pool.length,
    });
  }
  const employees = employeesOf(input.num_funcionarios, input.porte);
  const highTicket =
    employees != null && employees >= Number(routing.porte_min_funcionarios ?? 101);
  return {
    cs_responsavel_id: cs,
    comercial_responsavel_id: highTicket ? pickFrom(routing.comercial_high, routing.rr_cursor) : cs,
  };
}

function pickFrom(list: string[] | null | undefined, cursor: number): string | null {
  if (!list || list.length === 0) return null;
  return list[Math.abs(cursor) % list.length] ?? null;
}

export async function logTimeline(
  db: DB,
  event: {
    client_uid: string;
    author_id?: string | null;
    event_type: string;
    channel?: string | null;
    title: string;
    description?: string | null;
    metadata?: Record<string, unknown>;
    occurred_at?: string;
  },
) {
  await db.from("cs_timeline_events").insert({
    client_uid: event.client_uid,
    author_id: event.author_id ?? null,
    event_type: event.event_type,
    channel: event.channel ?? null,
    title: event.title,
    description: event.description ?? null,
    metadata: (event.metadata ?? {}) as never,
    occurred_at: event.occurred_at ?? new Date().toISOString(),
  });
}

/** Tag acumulativa na empresa, sem duplicar a mesma tag no mesmo dia. */
export async function addClientTag(
  db: DB,
  input: {
    client_uid: string;
    tag: string;
    origem_agenda_id?: string | null;
    created_by?: string | null;
  },
) {
  const since = new Date(Date.now() - 86400000).toISOString();
  const { data: existing } = await db
    .from("cs_client_tags")
    .select("id")
    .eq("client_uid", input.client_uid)
    .eq("tag", input.tag)
    .gte("data_criacao", since)
    .maybeSingle();
  if (existing) return;
  await db.from("cs_client_tags").insert({
    client_uid: input.client_uid,
    tag: input.tag,
    origem_agenda_id: input.origem_agenda_id ?? null,
    created_by: input.created_by ?? null,
  });
}

export function tagForAgenda(agendaType: string): string {
  return CS_AGENDA_TAG[agendaType] ?? agendaType;
}

/**
 * Recalcula o health score (fórmula v2): sinaleira por cor, agenda em 90 dias,
 * WhatsApp respondido, proposta em aberto, masterclass realizada e analista PDA
 * certificado. Cliente sem sinaleira é renormalizado sobre os demais critérios.
 */
export async function recomputeHealth(db: DB, clientUid: string): Promise<number> {
  const [weights, points, options] = await Promise.all([
    getHealthWeights(db),
    getHealthSignalPoints(db),
    getHealthOptions(db),
  ]);
  const since90 = new Date(Date.now() - 90 * 86400000).toISOString();

  const [clientRes, snapRes, eventsRes, tagsRes, contactsRes, salesRes, mcRes] = await Promise.all([
    db
      .from("cs_clients")
      .select("client_uid, tipo_lead, tipo_servico, login_pda, current_signal")
      .eq("client_uid", clientUid)
      .maybeSingle(),
    db
      .from("cs_signal_snapshots")
      .select("signal, week_start")
      .eq("client_uid", clientUid)
      .order("week_start", { ascending: false })
      .limit(1),
    db
      .from("cs_timeline_events")
      .select("event_type, channel, metadata, occurred_at")
      .eq("client_uid", clientUid)
      .gte("occurred_at", since90),
    db.from("cs_client_tags").select("tag, data_criacao").eq("client_uid", clientUid),
    db.from("cs_contacts").select("analista_pda, ativo_no_cliente").eq("client_uid", clientUid),
    db
      .from("cs_sales")
      .select("id")
      .eq("client_uid", clientUid)
      .eq("status", "em_negociacao")
      .limit(1),
    db.from("cs_masterclass_participations").select("id").eq("client_uid", clientUid).limit(1),
  ]);
  // Uso da Plataforma de CS nos últimos 90 dias (sincronizado todo dia às 08:10).
  const { data: usoPlataforma } = await (db as unknown as SupabaseClient)
    .from("cs_plataforma_uso")
    .select("email")
    .eq("client_uid", clientUid)
    .gte("ultima_atividade", since90)
    .limit(1);

  if (!clientRes.data) return 0;
  const c = clientRes.data as Record<string, unknown>;
  // Consultoria é isolada das métricas gerenciais.
  if (c["tipo_lead"] === "consultoria") return 0;

  const signal = (snapRes.data?.[0]?.signal ?? c["current_signal"] ?? "sem_dado") as CsSignal;
  const score = computeHealthScore(
    montarEntradaDeSaude({
      cliente: {
        tipo_servico: c["tipo_servico"] as string | null,
        login_pda: c["login_pda"] as string | null,
      },
      signal,
      eventos90d: (eventsRes.data ?? []) as EventoParaSaude[],
      propostaAberta: (salesRes.data ?? []).length > 0,
      temParticipacaoMasterclass: (mcRes.data ?? []).length > 0,
      tags: (tagsRes.data ?? []).map((t) => t.tag as string),
      analistaPda: (contactsRes.data ?? []).some(
        (k) =>
          (k as Record<string, unknown>)["analista_pda"] === true && k.ativo_no_cliente !== false,
      ),
      usaPlataforma: (usoPlataforma ?? []).length > 0,
    }),
    weights,
    points,
    options,
  );

  await db
    .from("cs_clients")
    .update({ health_score: score, current_signal: signal })
    .eq("client_uid", clientUid);
  return score;
}

/**
 * Recalcula a saúde da carteira ativa inteira de uma vez (mesma fórmula de
 * recomputeHealth, com os dados buscados em bloco). Roda todo dia depois do
 * sync da sinaleira: sem ele, só a empresa que está na planilha ou que teve
 * alguma ação era recalculada, e mensagem recebida ou reunião não mexiam no
 * número. Só grava o que mudou.
 */
export async function recomputeHealthAll(
  db: DB,
): Promise<{ clientes: number; alterados: number; erros: number }> {
  const [weights, points, options] = await Promise.all([
    getHealthWeights(db),
    getHealthSignalPoints(db),
    getHealthOptions(db),
  ]);
  const since90 = new Date(Date.now() - 90 * 86400000).toISOString();
  const recentes = lastNWeeks(6)[0];

  type Cliente = {
    client_uid: string;
    tipo_lead: string | null;
    tipo_servico: string | null;
    login_pda: string | null;
    current_signal: string | null;
    health_score: number | null;
  };
  const [clientes, snaps, eventos, tags, contatos, vendas, participacoes] = await Promise.all([
    fetchAllRows<Cliente>(
      (a, b) =>
        db
          .from("cs_clients")
          .select("client_uid, tipo_lead, tipo_servico, login_pda, current_signal, health_score")
          .eq("ativo", true)
          .order("client_uid")
          .range(a, b) as never,
    ),
    fetchAllRows<{ client_uid: string; signal: string; week_start: string }>(
      (a, b) =>
        db
          .from("cs_signal_snapshots")
          .select("client_uid, signal, week_start")
          .gte("week_start", recentes)
          .order("client_uid")
          .order("week_start")
          .range(a, b) as never,
    ),
    fetchAllRows<EventoParaSaude & { client_uid: string }>(
      (a, b) =>
        db
          .from("cs_timeline_events")
          .select("client_uid, event_type, channel, metadata")
          .gte("occurred_at", since90)
          .order("id")
          .range(a, b) as never,
    ),
    fetchAllRows<{ client_uid: string; tag: string }>(
      (a, b) =>
        db
          .from("cs_client_tags")
          .select("client_uid, tag")
          .ilike("tag", "%masterclass%")
          .order("id")
          .range(a, b) as never,
    ),
    fetchAllRows<{ client_uid: string; ativo_no_cliente: boolean | null }>(
      (a, b) =>
        db
          .from("cs_contacts")
          .select("client_uid, ativo_no_cliente")
          .eq("analista_pda", true)
          .order("id")
          .range(a, b) as never,
    ),
    fetchAllRows<{ client_uid: string }>(
      (a, b) =>
        db
          .from("cs_sales")
          .select("client_uid")
          .eq("status", "em_negociacao")
          .order("id")
          .range(a, b) as never,
    ),
    fetchAllRows<{ client_uid: string }>(
      (a, b) =>
        db
          .from("cs_masterclass_participations")
          .select("client_uid")
          .order("id")
          .range(a, b) as never,
    ),
  ]);
  // Uso da Plataforma de CS nos últimos 90 dias (sincronizado todo dia às 08:10).
  const usoPlataforma = await fetchAllRows<{ client_uid: string }>(
    (a, b) =>
      (db as unknown as SupabaseClient)
        .from("cs_plataforma_uso")
        .select("client_uid")
        .gte("ultima_atividade", since90)
        .order("client_uid")
        .order("email")
        .range(a, b) as never,
  );
  const comPlataforma = new Set(usoPlataforma.map((u) => u.client_uid));

  // a semana mais recente de cada empresa (as linhas vêm em ordem de semana)
  const ultimoSinal = new Map<string, CsSignal>();
  for (const s of snaps) ultimoSinal.set(s.client_uid, s.signal as CsSignal);
  const agrupar = <T extends { client_uid: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) {
      const l = m.get(r.client_uid);
      if (l) l.push(r);
      else m.set(r.client_uid, [r]);
    }
    return m;
  };
  const eventosDe = agrupar(eventos);
  const tagsDe = agrupar(tags);
  const comAnalista = new Set(
    contatos.filter((k) => k.ativo_no_cliente !== false).map((k) => k.client_uid),
  );
  const comProposta = new Set(vendas.map((v) => v.client_uid));
  const comMasterclass = new Set(participacoes.map((p) => p.client_uid));

  const mudancas: Array<{ client_uid: string; health_score: number; current_signal: CsSignal }> =
    [];
  for (const c of clientes) {
    const signal = (ultimoSinal.get(c.client_uid) ?? c.current_signal ?? "sem_dado") as CsSignal;
    // Consultoria é isolada das métricas gerenciais.
    const score =
      c.tipo_lead === "consultoria"
        ? 0
        : computeHealthScore(
            montarEntradaDeSaude({
              cliente: c,
              signal,
              eventos90d: eventosDe.get(c.client_uid) ?? [],
              propostaAberta: comProposta.has(c.client_uid),
              temParticipacaoMasterclass: comMasterclass.has(c.client_uid),
              tags: (tagsDe.get(c.client_uid) ?? []).map((t) => t.tag),
              analistaPda: comAnalista.has(c.client_uid),
              usaPlataforma: comPlataforma.has(c.client_uid),
            }),
            weights,
            points,
            options,
          );
    if (score !== (c.health_score ?? 0) || signal !== c.current_signal)
      mudancas.push({ client_uid: c.client_uid, health_score: score, current_signal: signal });
  }

  let erros = 0;
  const LOTE = 40;
  for (let i = 0; i < mudancas.length; i += LOTE) {
    const res = await Promise.all(
      mudancas
        .slice(i, i + LOTE)
        .map((m) =>
          db
            .from("cs_clients")
            .update({ health_score: m.health_score, current_signal: m.current_signal })
            .eq("client_uid", m.client_uid),
        ),
    );
    erros += res.filter((r) => r.error).length;
  }
  return { clientes: clientes.length, alterados: mudancas.length - erros, erros };
}

/** Varre a carteira e gera alertas (sinaleira crítica, queda, SLA, sem contato, upsell). */
export async function generateCsAlerts(db: DB): Promise<{ created: number }> {
  const sla = await getStageSla(db);
  const weeks = lastNWeeks(8);
  // Dia 1 do CS: prazos contam a partir do início da operação.
  const { ancorar } = await import("@/lib/cs/inicio-operacao");
  const inicio = await getInicioOperacao(db);

  const { data: clients } = await db
    .from("cs_clients")
    .select(
      "client_uid, nome_empresa, tipo_lead, journey_stage, stage_entered_at, last_contact_at, ativo",
    )
    .eq("ativo", true)
    .neq("tipo_lead", "consultoria");
  if (!clients?.length) return { created: 0 };

  const { data: snaps } = await db
    .from("cs_signal_snapshots")
    .select("client_uid, week_start, signal")
    .gte("week_start", weeks[0])
    .order("week_start", { ascending: true });

  const { data: openAlerts } = await db
    .from("cs_alerts")
    .select("client_uid, alert_type")
    .eq("status", "open");
  const openKey = new Set((openAlerts ?? []).map((a) => `${a.client_uid}:${a.alert_type}`));

  const byClient = new Map<string, CsSignal[]>();
  for (const s of snaps ?? []) {
    const arr = byClient.get(s.client_uid) ?? [];
    arr.push(s.signal as CsSignal);
    byClient.set(s.client_uid, arr);
  }

  const pending: Array<{
    client_uid: string;
    alert_type: string;
    reason: string;
    severity: string;
  }> = [];

  // Bloco 15: cliente sem analista PDA certificado cadastrado é risco silencioso.
  const { data: analysts } = await db
    .from("cs_contacts")
    .select("client_uid")
    .eq("analista_pda", true)
    .neq("ativo_no_cliente", false);
  const withAnalyst = new Set((analysts ?? []).map((a) => a.client_uid));

  const now = Date.now();
  for (const c of clients) {
    const hist = byClient.get(c.client_uid) ?? [];
    if (!withAnalyst.has(c.client_uid) && c.tipo_lead !== "consultoria") {
      pending.push({
        client_uid: c.client_uid,
        alert_type: "sem_analista",
        reason:
          "Nenhum analista PDA certificado cadastrado nos contatos — quando o uso cair, a primeira hipótese é essa.",
        severity: "media",
      });
    }
    if (hist[hist.length - 1] === "preto") {
      pending.push({
        client_uid: c.client_uid,
        alert_type: "licenca_vencida",
        reason: "Licença vencida ou conta inativa — entrar na fila de reativação com o Executivo.",
        severity: "media",
      });
    }
    const trend = analyzeSignalTrend(byClient.get(c.client_uid) ?? []);
    if (trend.kind === "critico") {
      pending.push({
        client_uid: c.client_uid,
        alert_type: "sinaleira_critica",
        reason: `${trend.weeks} semanas seguidas em vermelho na sinaleira de consumo PDA.`,
        severity: "critica",
      });
    } else if (trend.kind === "queda") {
      pending.push({
        client_uid: c.client_uid,
        alert_type: "queda_sinaleira",
        reason: "Cliente veio de verde e caiu para vermelho nesta semana.",
        severity: "alta",
      });
    } else if (trend.kind === "oportunidade") {
      pending.push({
        client_uid: c.client_uid,
        alert_type: "oportunidade_upsell",
        reason: `${trend.weeks} semanas em verde — oportunidade de cross-sell/upsell (avisar comercial).`,
        severity: "baixa",
      });
    }

    const stageDays = Math.floor(
      (now - new Date(ancorar(c.stage_entered_at, inicio) ?? c.stage_entered_at).getTime()) /
        86400000,
    );
    const limit = sla[c.journey_stage as keyof StageSla] as number;
    if (typeof limit === "number" && stageDays > limit) {
      pending.push({
        client_uid: c.client_uid,
        alert_type: "sla_estourado",
        reason: `SLA da etapa estourado: ${stageDays} dias (limite ${limit}).`,
        severity: "alta",
      });
    }

    const contatoAncorado = ancorar(c.last_contact_at, inicio);
    const contactDays = contatoAncorado
      ? Math.floor((now - new Date(contatoAncorado).getTime()) / 86400000)
      : null;
    if (contactDays === null || contactDays > sla.sem_contato_dias) {
      pending.push({
        client_uid: c.client_uid,
        alert_type: "sem_contato",
        reason:
          contactDays === null
            ? "Nenhum contato registrado com este cliente."
            : `Sem contato há ${contactDays} dias (limite ${sla.sem_contato_dias}).`,
        severity: "media",
      });
    }
  }

  const toInsert = pending.filter((p) => !openKey.has(`${p.client_uid}:${p.alert_type}`));
  if (toInsert.length === 0) return { created: 0 };
  const { error } = await db.from("cs_alerts").insert(toInsert as never);
  if (error) throw new Error(error.message);
  return { created: toInsert.length };
}
