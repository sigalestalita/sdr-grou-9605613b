import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CadencePlan } from "@/lib/cs/cadence";

export type CsCadenceRow = {
  clientUid: string;
  clientName: string;
  tipoLead: string;
  stage: string;
  healthScore: number;
  aporte: number;
  ownerId: string | null;
  ownerName: string;
  execId: string | null;
  execName: string;
  renewal: string | null;
  contractStart: string | null;
  lastContactAt: string | null;
  history: string[];
  weeks: string[];
  tags: string[];
  plan: CadencePlan;
};

export type CsCadenceData = {
  rows: CsCadenceRow[];
  owners: { id: string; name: string }[];
  totals: {
    clients: number;
    due: number;
    inGrace: number;
    goalAtRisk: number;
    escalateExecutivo: number;
    escalateDiretoria: number;
    byUrgency: Record<string, number>;
    byWeekday: Record<string, number>;
  };
};

/**
 * Motor de cadência do Playbook CS v2: para cada cliente ativo calcula cor,
 * semanas na cor, tendência, intervalo devido e a ação sugerida da semana.
 */
export const getCsCadence = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        ownerId: z.string().uuid().nullable().optional(),
        tipo: z.enum(["empresa", "consultoria", "all"]).default("empresa"),
        weeks: z.number().int().min(4).max(16).default(12),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<CsCadenceData> => {
    const { supabase } = context;
    const { fetchAllRows } = await import("@/lib/cs/cs-core.server");
    const { computeCadence, URGENCY_ORDER } = await import("@/lib/cs/cadence");
    const { lastNWeeks } = await import("@/lib/cs-types");

    const weeks = lastNWeeks(data.weeks);
    const since240 = new Date(Date.now() - 240 * 86400000).toISOString();

    const [clients, snapshots, timeline, tags, profilesRes] = await Promise.all([
      fetchAllRows<Record<string, unknown>>((f, t) => {
        let q = supabase
          .from("cs_clients")
          .select(
            "client_uid, nome_empresa, tipo_lead, journey_stage, health_score, aporte_valor, cs_responsavel_id, comercial_responsavel_id, data_inicio_contrato, data_renovacao, last_contact_at, current_signal, pda_consumo_pct, ativo",
          )
          .eq("ativo", true);
        if (data.tipo !== "all") q = q.eq("tipo_lead", data.tipo);
        if (data.ownerId) q = q.eq("cs_responsavel_id", data.ownerId);
        return q.range(f, t);
      }),
      fetchAllRows<Record<string, unknown>>((f, t) =>
        supabase
          .from("cs_signal_snapshots")
          .select("client_uid, week_start, signal, consumo_pct")
          .gte("week_start", weeks[0])
          .order("week_start", { ascending: true })
          .range(f, t),
      ),
      fetchAllRows<Record<string, unknown>>((f, t) =>
        supabase
          .from("cs_timeline_events")
          .select("client_uid, event_type, channel, metadata, occurred_at")
          .gte("occurred_at", since240)
          .lte("occurred_at", new Date().toISOString())
          .range(f, t),
      ),
      fetchAllRows<Record<string, unknown>>((f, t) =>
        supabase.from("cs_client_tags").select("client_uid, tag").range(f, t),
      ),
      supabase.from("profiles").select("id, full_name, email"),
    ]);

    const nameById = new Map<string, string>();
    for (const p of profilesRes.data ?? []) {
      nameById.set(p.id as string, (p.full_name as string) || (p.email as string) || "—");
    }

    const snapsByClient = new Map<
      string,
      { week_start: string; signal: string; consumo_pct: number | null }[]
    >();
    for (const s of snapshots) {
      const uid = s["client_uid"] as string;
      const arr = snapsByClient.get(uid) ?? [];
      arr.push({
        week_start: s["week_start"] as string,
        signal: s["signal"] as string,
        consumo_pct: s["consumo_pct"] === null ? null : Number(s["consumo_pct"]),
      });
      snapsByClient.set(uid, arr);
    }

    const responsesByClient = new Map<string, number>();
    for (const e of timeline) {
      const uid = e["client_uid"] as string;
      const meta = (e["metadata"] ?? {}) as Record<string, unknown>;
      const answered =
        meta["answered"] === true ||
        meta["engajamento"] === true ||
        e["event_type"] === "agenda" ||
        e["event_type"] === "reuniao_realizada" ||
        e["event_type"] === "reuniao";
      if (!answered) continue;
      responsesByClient.set(uid, (responsesByClient.get(uid) ?? 0) + 1);
    }

    const tagsByClient = new Map<string, string[]>();
    for (const t of tags) {
      const uid = t["client_uid"] as string;
      const arr = tagsByClient.get(uid) ?? [];
      if (!arr.includes(t["tag"] as string)) arr.push(t["tag"] as string);
      tagsByClient.set(uid, arr);
    }

    const now = new Date();
    const rows: CsCadenceRow[] = clients.map((c) => {
      const uid = c["client_uid"] as string;
      const snaps = snapsByClient.get(uid) ?? [];
      const filled = weeks.map((w) => {
        const hit = snaps.find((s) => s.week_start === w);
        return {
          week_start: w,
          signal: (hit?.signal ?? "sem_dado") as never,
          consumo_pct: hit?.consumo_pct ?? null,
        };
      });
      if (snaps.length === 0 && c["current_signal"] && c["current_signal"] !== "sem_dado") {
        filled[filled.length - 1] = {
          week_start: weeks[weeks.length - 1],
          signal: c["current_signal"] as never,
          consumo_pct: c["pda_consumo_pct"] === null ? null : Number(c["pda_consumo_pct"]),
        };
      }
      const plan = computeCadence({
        snapshots: filled,
        contractStart: (c["data_inicio_contrato"] as string) ?? null,
        renewal: (c["data_renovacao"] as string) ?? null,
        lastContactAt: (c["last_contact_at"] as string) ?? null,
        contactsWithResponse: responsesByClient.get(uid) ?? 0,
        now,
      });
      const ownerId = (c["cs_responsavel_id"] as string) ?? null;
      const execId = (c["comercial_responsavel_id"] as string) ?? null;
      return {
        clientUid: uid,
        clientName: (c["nome_empresa"] as string) ?? uid,
        tipoLead: (c["tipo_lead"] as string) ?? "empresa",
        stage: (c["journey_stage"] as string) ?? "onboarding",
        healthScore: Number(c["health_score"] ?? 0),
        aporte: Number(c["aporte_valor"] ?? 0),
        ownerId,
        ownerName: ownerId ? (nameById.get(ownerId) ?? "—") : "Sem CS",
        execId,
        execName: execId ? (nameById.get(execId) ?? "—") : "—",
        renewal: (c["data_renovacao"] as string) ?? null,
        contractStart: (c["data_inicio_contrato"] as string) ?? null,
        lastContactAt: (c["last_contact_at"] as string) ?? null,
        history: filled.map((f) => f.signal as string),
        weeks,
        tags: tagsByClient.get(uid) ?? [],
        plan,
      };
    });

    rows.sort((a, b) => {
      const ua = URGENCY_ORDER.indexOf(a.plan.urgency);
      const ub = URGENCY_ORDER.indexOf(b.plan.urgency);
      if (ua !== ub) return ua - ub;
      if (a.plan.due !== b.plan.due) return a.plan.due ? -1 : 1;
      return b.plan.overdueDays - a.plan.overdueDays;
    });

    const byUrgency: Record<string, number> = {};
    const byWeekday: Record<string, number> = {};
    let due = 0;
    let inGrace = 0;
    let goalAtRisk = 0;
    let escalateExecutivo = 0;
    let escalateDiretoria = 0;
    for (const r of rows) {
      byUrgency[r.plan.urgency] = (byUrgency[r.plan.urgency] ?? 0) + 1;
      if (r.plan.due) {
        due++;
        byWeekday[String(r.plan.suggestedWeekday)] =
          (byWeekday[String(r.plan.suggestedWeekday)] ?? 0) + 1;
      }
      if (r.plan.inGrace) inGrace++;
      if (r.plan.goalAtRisk) goalAtRisk++;
      if (r.plan.escalate === "executivo") escalateExecutivo++;
      if (r.plan.escalate === "diretoria") escalateDiretoria++;
    }

    const ownerMap = new Map<string, string>();
    for (const r of rows) if (r.ownerId) ownerMap.set(r.ownerId, r.ownerName);

    return {
      rows,
      owners: [...ownerMap.entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      totals: {
        clients: rows.length,
        due,
        inGrace,
        goalAtRisk,
        escalateExecutivo,
        escalateDiretoria,
        byUrgency,
        byWeekday,
      },
    };
  });

export type CsPlaybookBlock = {
  id: string;
  tipo: string;
  titulo: string;
  corpo: string;
  cor: string;
  ordem: number;
  ativo: boolean;
};

/** Blocos do Playbook CS (gatilhos, playbooks, ofertas e conteúdos de contato). */
export const listCsPlaybook = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CsPlaybookBlock[]> => {
    const { data, error } = await context.supabase
      .from("cs_playbook_blocks")
      .select("id, tipo, titulo, corpo, cor, ordem, ativo")
      .order("ordem", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as CsPlaybookBlock[];
  });

/** Cria ou atualiza um bloco do playbook (somente gestão pelas policies). */
export const saveCsPlaybookBlock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        tipo: z.enum(["gatilho_descricao", "playbook", "oferta", "conteudo_contato"]),
        titulo: z.string().min(2),
        corpo: z.string().min(2),
        cor: z.enum(["geral", "verde", "amarelo", "vermelho"]).default("geral"),
        ordem: z.number().int().min(0).default(0),
        ativo: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("cs_playbook_blocks").upsert({
      ...(data.id ? { id: data.id } : {}),
      tipo: data.tipo,
      titulo: data.titulo,
      corpo: data.corpo,
      cor: data.cor,
      ordem: data.ordem,
      ativo: data.ativo,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
