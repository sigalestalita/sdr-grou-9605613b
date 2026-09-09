import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CsOwnerPerformance = {
  ownerId: string | null;
  ownerName: string;
  clients: number;
  clientsEmpresa: number;
  clientsConsultoria: number;
  aporte: number;
  healthAvg: number;
  signals: { verde: number; amarelo: number; vermelho: number; preto: number; sem_dado: number };
  alertsOpen: number;
  alertsResolved: number;
  meetingsHeld: number;
  meetingsCanceled: number;
  touches: number;
  followUpsPending: number;
  followUpsOverdue: number;
  salesTotal: number;
  staleClients: number;
};

export type CsDashboardData = {
  range: { from: string; to: string; days: number };
  totals: {
    clients: number;
    clientsEmpresa: number;
    clientsConsultoria: number;
    aporte: number;
    healthAvg: number;
    signals: { verde: number; amarelo: number; vermelho: number; preto: number; sem_dado: number };
    stages: { onboarding: number; ativacao: number; renovacao: number };
    alertsOpen: number;
    alertsResolved: number;
    meetingsHeld: number;
    touches: number;
    followUpsPending: number;
    followUpsOverdue: number;
    salesTotal: number;
    renewalsNext60: number;
    staleClients: number;
  };
  owners: CsOwnerPerformance[];
  signalTrend: {
    week: string;
    verde: number;
    amarelo: number;
    vermelho: number;
    sem_dado: number;
  }[];
  activityByDay: { day: string; touches: number; meetings: number }[];
};

const emptySignals = () => ({ verde: 0, amarelo: 0, vermelho: 0, preto: 0, sem_dado: 0 });

/** Métricas consolidadas do time de CS + desempenho por liderado (somente gestão). */
export const getCsDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ days: z.number().int().min(7).max(180).default(30) }).parse(d ?? {}),
  )
  .handler(async ({ data, context }): Promise<CsDashboardData> => {
    const { supabase, userId } = context;
    const { data: isManager } = await supabase.rpc("is_manager", { _user_id: userId });
    if (!isManager) throw new Error("Apenas a gestão pode ver o dashboard de CS");

    const { fetchAllRows } = await import("@/lib/cs/cs-core.server");
    const now = new Date();
    const from = new Date(now.getTime() - data.days * 86400000);
    const fromIso = from.toISOString();
    const nowIso = now.toISOString();

    const [clients, alerts, meetings, timeline, sales, snapshots, profilesRes] = await Promise.all([
      fetchAllRows<Record<string, unknown>>((f, t) =>
        supabase
          .from("cs_clients")
          .select(
            "client_uid, nome_empresa, tipo_lead, aporte_valor, cs_responsavel_id, journey_stage, current_signal, health_score, last_contact_at, data_renovacao, ativo",
          )
          .eq("ativo", true)
          .range(f, t),
      ),
      fetchAllRows<Record<string, unknown>>((f, t) =>
        supabase
          .from("cs_alerts")
          .select("client_uid, status, severity, created_at, resolved_at, follow_up_at")
          .range(f, t),
      ),
      fetchAllRows<Record<string, unknown>>((f, t) =>
        supabase
          .from("cs_meetings")
          .select("client_uid, owner_user_id, status, occurred_at, next_step_at")
          .gte("occurred_at", fromIso)
          .range(f, t),
      ),
      fetchAllRows<Record<string, unknown>>((f, t) =>
        supabase
          .from("cs_timeline_events")
          .select("client_uid, author_id, event_type, occurred_at")
          .gte("occurred_at", fromIso)
          .range(f, t),
      ),
      fetchAllRows<Record<string, unknown>>((f, t) =>
        supabase.from("cs_sales").select("client_uid, total_value, sale_date, status").range(f, t),
      ),
      fetchAllRows<Record<string, unknown>>((f, t) =>
        supabase
          .from("cs_signal_snapshots")
          .select("client_uid, week_start, signal")
          .gte("week_start", from.toISOString().slice(0, 10))
          .range(f, t),
      ),
      supabase.from("profiles").select("id, full_name, email"),
    ]);

    const profiles = profilesRes.data ?? [];
    const nameOf = (id: string | null) => {
      if (!id) return "Sem responsável";
      const p = profiles.find((x) => x.id === id);
      return p?.full_name || p?.email || "Sem responsável";
    };

    const ownerOfClient = new Map<string, string | null>();
    const buckets = new Map<string | null, CsOwnerPerformance>();
    const ensure = (id: string | null): CsOwnerPerformance => {
      let b = buckets.get(id);
      if (!b) {
        b = {
          ownerId: id,
          ownerName: nameOf(id),
          clients: 0,
          clientsEmpresa: 0,
          clientsConsultoria: 0,
          aporte: 0,
          healthAvg: 0,
          signals: emptySignals(),
          alertsOpen: 0,
          alertsResolved: 0,
          meetingsHeld: 0,
          meetingsCanceled: 0,
          touches: 0,
          followUpsPending: 0,
          followUpsOverdue: 0,
          salesTotal: 0,
          staleClients: 0,
        };
        buckets.set(id, b);
      }
      return b;
    };

    const totals: CsDashboardData["totals"] = {
      clients: 0,
      clientsEmpresa: 0,
      clientsConsultoria: 0,
      aporte: 0,
      healthAvg: 0,
      signals: emptySignals(),
      stages: { onboarding: 0, ativacao: 0, renovacao: 0 },
      alertsOpen: 0,
      alertsResolved: 0,
      meetingsHeld: 0,
      touches: 0,
      followUpsPending: 0,
      followUpsOverdue: 0,
      salesTotal: 0,
      renewalsNext60: 0,
      staleClients: 0,
    };

    const healthSum = new Map<string | null, { sum: number; n: number }>();
    const staleLimit = now.getTime() - 30 * 86400000;
    const in60 = new Date(now.getTime() + 60 * 86400000).toISOString().slice(0, 10);
    const todayStr = now.toISOString().slice(0, 10);

    for (const c of clients) {
      const owner = (c["cs_responsavel_id"] as string | null) ?? null;
      const uid = String(c["client_uid"]);
      ownerOfClient.set(uid, owner);
      const b = ensure(owner);
      b.clients++;
      totals.clients++;
      if (c["tipo_lead"] === "consultoria") {
        b.clientsConsultoria++;
        totals.clientsConsultoria++;
      } else {
        b.clientsEmpresa++;
        totals.clientsEmpresa++;
      }
      const aporte = Number(c["aporte_valor"] ?? 0);
      b.aporte += aporte;
      totals.aporte += aporte;

      const signal = String(c["current_signal"] ?? "sem_dado") as keyof typeof b.signals;
      if (signal in b.signals) {
        b.signals[signal]++;
        totals.signals[signal]++;
      }
      const stage = String(c["journey_stage"] ?? "") as keyof typeof totals.stages;
      if (stage in totals.stages) totals.stages[stage]++;

      const hs = Number(c["health_score"] ?? 0);
      const agg = healthSum.get(owner) ?? { sum: 0, n: 0 };
      agg.sum += hs;
      agg.n++;
      healthSum.set(owner, agg);

      const last = c["last_contact_at"] ? new Date(String(c["last_contact_at"])).getTime() : 0;
      if (!last || last < staleLimit) {
        b.staleClients++;
        totals.staleClients++;
      }
      const renewal = c["data_renovacao"] ? String(c["data_renovacao"]) : null;
      if (renewal && renewal >= todayStr && renewal <= in60) totals.renewalsNext60++;
    }

    for (const [owner, agg] of healthSum) {
      const b = ensure(owner);
      b.healthAvg = agg.n ? Math.round(agg.sum / agg.n) : 0;
    }
    const allHealth = clients.reduce((s, c) => s + Number(c["health_score"] ?? 0), 0);
    totals.healthAvg = clients.length ? Math.round(allHealth / clients.length) : 0;

    for (const a of alerts) {
      const owner = ownerOfClient.get(String(a["client_uid"])) ?? null;
      if (!ownerOfClient.has(String(a["client_uid"]))) continue;
      const b = ensure(owner);
      if (a["status"] === "open") {
        b.alertsOpen++;
        totals.alertsOpen++;
        const fu = a["follow_up_at"] ? String(a["follow_up_at"]) : null;
        if (fu) {
          b.followUpsPending++;
          totals.followUpsPending++;
          if (fu < nowIso) {
            b.followUpsOverdue++;
            totals.followUpsOverdue++;
          }
        }
      } else if (a["resolved_at"] && String(a["resolved_at"]) >= fromIso) {
        b.alertsResolved++;
        totals.alertsResolved++;
      }
    }

    const activity = new Map<string, { touches: number; meetings: number }>();
    const dayKey = (iso: string) => String(iso).slice(0, 10);
    const bumpDay = (iso: string, key: "touches" | "meetings") => {
      const k = dayKey(iso);
      const cur = activity.get(k) ?? { touches: 0, meetings: 0 };
      cur[key]++;
      activity.set(k, cur);
    };

    for (const m of meetings) {
      const owner =
        (m["owner_user_id"] as string | null) ?? ownerOfClient.get(String(m["client_uid"])) ?? null;
      const b = ensure(owner);
      if (m["status"] === "canceled" || m["status"] === "cancelled") {
        b.meetingsCanceled++;
      } else {
        b.meetingsHeld++;
        totals.meetingsHeld++;
        bumpDay(String(m["occurred_at"]), "meetings");
      }
      const ns = m["next_step_at"] ? String(m["next_step_at"]) : null;
      if (ns) {
        b.followUpsPending++;
        totals.followUpsPending++;
        if (ns < nowIso) {
          b.followUpsOverdue++;
          totals.followUpsOverdue++;
        }
      }
    }

    for (const t of timeline) {
      const occurred = String(t["occurred_at"]);
      if (occurred > nowIso) continue; // futuro = follow-up agendado
      const owner =
        (t["author_id"] as string | null) ?? ownerOfClient.get(String(t["client_uid"])) ?? null;
      const b = ensure(owner);
      b.touches++;
      totals.touches++;
      bumpDay(occurred, "touches");
    }
    for (const t of timeline) {
      if (String(t["occurred_at"]) <= nowIso) continue;
      const owner =
        (t["author_id"] as string | null) ?? ownerOfClient.get(String(t["client_uid"])) ?? null;
      const b = ensure(owner);
      b.followUpsPending++;
      totals.followUpsPending++;
    }

    for (const s of sales) {
      const saleDate = s["sale_date"] ? String(s["sale_date"]) : null;
      if (!saleDate || saleDate < fromIso.slice(0, 10)) continue;
      if (s["status"] === "cancelado" || s["status"] === "canceled") continue;
      const owner = ownerOfClient.get(String(s["client_uid"])) ?? null;
      const b = ensure(owner);
      const v = Number(s["total_value"] ?? 0);
      b.salesTotal += v;
      totals.salesTotal += v;
    }

    const trendMap = new Map<
      string,
      { verde: number; amarelo: number; vermelho: number; preto: number; sem_dado: number }
    >();
    for (const s of snapshots) {
      const week = String(s["week_start"]);
      const cur = trendMap.get(week) ?? emptySignals();
      const sig = String(s["signal"] ?? "sem_dado") as keyof typeof cur;
      if (sig in cur) cur[sig]++;
      trendMap.set(week, cur);
    }

    const owners = [...buckets.values()]
      .filter((o) => o.clients > 0 || o.touches > 0 || o.meetingsHeld > 0)
      .sort((a, b) => b.clients - a.clients);

    return {
      range: { from: fromIso, to: nowIso, days: data.days },
      totals,
      owners,
      signalTrend: [...trendMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([week, v]) => ({ week, ...v })),
      activityByDay: [...activity.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, v]) => ({ day, ...v })),
    };
  });
