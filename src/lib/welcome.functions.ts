import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { SLA_FIRST_TOUCH_MINUTES } from "@/lib/sdr-playbook";
import type { Membership } from "@/lib/teams";

/*
 * Tela de boas-vindas: as métricas mais importantes para a pessoa, conforme
 * o que ela faz (SDR, executivo comercial, analista de CS, gestão). A gestão
 * pode olhar as mesmas métricas de alguém do time.
 */

const PAGE = 1000;

async function fetchAll<T>(
  build: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < 50; page++) {
    const { data, error } = await build(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

type LeadLite = {
  id: string;
  name: string | null;
  company_name: string | null;
  assigned_to: string | null;
  executivo_id: string | null;
  stage_id: string | null;
  stage_entered_at: string | null;
  created_at: string;
  first_approach_at: string | null;
  meeting_booked_at: string | null;
  meeting_at: string | null;
  meeting_invite_sent_at: string | null;
  lost_reason: string | null;
};

const LEAD_COLS =
  "id, name, company_name, assigned_to, executivo_id, stage_id, stage_entered_at, created_at, first_approach_at, meeting_booked_at, meeting_at, meeting_invite_sent_at, lost_reason";

export type SdrMetrics = {
  novos: number;
  abordados: number;
  marcadas: number;
  reunioesNoPeriodo: number;
  enviadosComercial: number;
  perdidos: number;
  taxaAgendamento: number | null;
  slaMediaMin: number | null;
  slaDentroPct: number | null;
  slaAmostra: number;
  mensagensWhatsapp: number;
  pipeline: Array<{ stage: string; slug: string; count: number }>;
  emAberto: number;
  proximasReunioes: Array<{
    id: string;
    company: string;
    name: string;
    meetingAt: string;
    executivo: string | null;
    conviteEnviado: boolean;
  }>;
};

export type ExecutivoMetrics = {
  marcadasParaMim: number;
  reunioesNoPeriodo: number;
  proximas: Array<{
    id: string;
    company: string;
    name: string;
    meetingAt: string;
    sdr: string | null;
    conviteEnviado: boolean;
  }>;
  carteira: { total: number; verde: number; amarelo: number; vermelho: number };
  tarefasPendentes: number;
  tarefasAtrasadas: number;
};

export type CsMetrics = {
  carteira: { total: number; verde: number; amarelo: number; vermelho: number };
  alertasAbertos: number;
  tarefasPendentes: number;
  tarefasAtrasadas: number;
  contatosNoPeriodo: number;
  reunioesNoPeriodo: number;
};

export type TeamRow = {
  id: string;
  name: string;
  novos: number;
  abordados: number;
  marcadas: number;
  taxa: number | null;
  slaDentroPct: number | null;
};

const inRange = (iso: string | null | undefined, from: Date, to: Date) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= from.getTime() && t < to.getTime();
};

function sdrFromLeads(
  leads: LeadLite[],
  from: Date,
  to: Date,
  stages: Array<{ id: string; name: string; slug: string; position: number }>,
) {
  const slugOf = new Map(stages.map((s) => [s.id, s.slug]));
  const novos = leads.filter((l) => inRange(l.created_at, from, to)).length;
  const abordadosList = leads.filter((l) => inRange(l.first_approach_at, from, to));
  const marcadas = leads.filter((l) => inRange(l.meeting_booked_at, from, to)).length;
  const reunioesNoPeriodo = leads.filter((l) => inRange(l.meeting_at, from, to)).length;
  const enviadosComercial = leads.filter(
    (l) => slugOf.get(l.stage_id ?? "") === "comercial" && inRange(l.stage_entered_at, from, to),
  ).length;
  const perdidos = leads.filter(
    (l) =>
      slugOf.get(l.stage_id ?? "") === "desqualificado" && inRange(l.stage_entered_at, from, to),
  ).length;
  const slas = abordadosList
    .filter((l) => l.first_approach_at)
    .map(
      (l) => (new Date(l.first_approach_at!).getTime() - new Date(l.created_at).getTime()) / 60000,
    )
    .filter((m) => m >= 0 && m < 60 * 24 * 30);
  const slaMediaMin = slas.length
    ? Math.round(slas.reduce((a, b) => a + b, 0) / slas.length)
    : null;
  const slaDentroPct = slas.length
    ? Math.round((slas.filter((m) => m <= SLA_FIRST_TOUCH_MINUTES).length / slas.length) * 100)
    : null;
  return {
    novos,
    abordados: abordadosList.length,
    marcadas,
    reunioesNoPeriodo,
    enviadosComercial,
    perdidos,
    taxaAgendamento: abordadosList.length
      ? Math.round((marcadas / abordadosList.length) * 100)
      : null,
    slaMediaMin,
    slaDentroPct,
    slaAmostra: slas.length,
  };
}

export const getWelcome = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        from: z.string().datetime(),
        to: z.string().datetime(),
        userId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId: me } = context;
    const from = new Date(data.from);
    const to = new Date(data.to);
    const now = new Date();

    // ---- quem sou / quem estou vendo ----
    const [{ data: myRoles }, { data: allLinks }, { data: teams }, { data: profiles }] =
      await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", me),
        supabase.from("user_teams").select("user_id, team, access"),
        supabase.from("teams").select("slug, nome, modulo, cor, ativo"),
        supabase.from("profiles").select("id, full_name, email"),
      ]);
    const roles = (myRoles ?? []).map((r) => r.role as string);
    const isManager = roles.includes("super_admin") || roles.includes("gestao");
    const links = (allLinks ?? []).map((l) => ({
      user_id: l.user_id as string,
      team: l.team as string,
      access: ((l as { access?: string[] }).access ?? []) as string[],
    }));
    const teamBySlug = new Map((teams ?? []).map((t) => [t.slug as string, t]));
    const nameOf = new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.email || p.id]));

    const target = data.userId && data.userId !== me ? data.userId : me;
    if (target !== me && !isManager) throw new Error("Só a gestão vê as métricas de outra pessoa");

    const membershipsOf = (uid: string): Membership[] =>
      links.filter((l) => l.user_id === uid).map((l) => ({ team: l.team, access: l.access }));
    const has = (uid: string, access: string, modulo?: string) =>
      membershipsOf(uid).some((m) => {
        const t = teamBySlug.get(m.team);
        return m.access.includes(access) && (!modulo || t?.modulo === modulo);
      });
    const targetMemberships = membershipsOf(target);
    const targetRoles =
      target === me
        ? roles
        : (
            (await supabaseAdmin.from("user_roles").select("role").eq("user_id", target)).data ?? []
          ).map((r) => r.role as string);
    const targetIsManager = targetRoles.includes("super_admin") || targetRoles.includes("gestao");

    const show = {
      sdr: has(target, "sdr", "comercial"),
      executivo: has(target, "executivo", "comercial") || targetRoles.includes("executivo"),
      cs: targetMemberships.some((m) => teamBySlug.get(m.team)?.modulo === "cs"),
      gestaoSdr: targetIsManager || has(target, "gestao", "comercial"),
    };

    // ---- pessoas que a gestão pode escolher ----
    const pickable = isManager
      ? [...new Set(links.map((l) => l.user_id))]
          .map((id) => ({
            id,
            name: nameOf.get(id) ?? id,
            teams: membershipsOf(id).map((m) => ({
              team: teamBySlug.get(m.team)?.nome ?? m.team,
              access: m.access,
            })),
          }))
          .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      : [];

    const { data: stagesRaw } = await supabase
      .from("stages")
      .select("id, name, slug, position")
      .order("position");
    const stages = (stagesRaw ?? []) as Array<{
      id: string;
      name: string;
      slug: string;
      position: number;
    }>;
    const stageById = new Map(stages.map((s) => [s.id, s]));
    const terminal = new Set(
      stages.filter((s) => s.slug === "comercial" || s.slug === "desqualificado").map((s) => s.id),
    );
    const periodOr = `created_at.gte.${from.toISOString()},first_approach_at.gte.${from.toISOString()},meeting_booked_at.gte.${from.toISOString()},meeting_at.gte.${from.toISOString()},stage_entered_at.gte.${from.toISOString()}`;

    // ---- SDR ----
    let sdr: SdrMetrics | null = null;
    if (show.sdr) {
      const [leads, { count: msgs }] = await Promise.all([
        fetchAll<LeadLite>((a, b) =>
          supabase
            .from("leads")
            .select(LEAD_COLS)
            .eq("assigned_to", target)
            .order("created_at", { ascending: false })
            .range(a, b),
        ),
        supabase
          .from("whatsapp_messages")
          .select("id", { count: "exact", head: true })
          .eq("sender_user_id", target)
          .gte("created_at", from.toISOString())
          .lt("created_at", to.toISOString()),
      ]);
      const base = sdrFromLeads(leads, from, to, stages);
      const pipelineCount = new Map<string, number>();
      for (const l of leads) {
        if (!l.stage_id || terminal.has(l.stage_id)) continue;
        pipelineCount.set(l.stage_id, (pipelineCount.get(l.stage_id) ?? 0) + 1);
      }
      sdr = {
        ...base,
        mensagensWhatsapp: msgs ?? 0,
        pipeline: stages
          .filter((s) => !terminal.has(s.id))
          .map((s) => ({ stage: s.name, slug: s.slug, count: pipelineCount.get(s.id) ?? 0 })),
        emAberto: [...pipelineCount.values()].reduce((a, b) => a + b, 0),
        proximasReunioes: leads
          .filter((l) => l.meeting_at && new Date(l.meeting_at) >= now)
          .sort((a, b) => a.meeting_at!.localeCompare(b.meeting_at!))
          .slice(0, 6)
          .map((l) => ({
            id: l.id,
            company: l.company_name ?? "—",
            name: l.name ?? "—",
            meetingAt: l.meeting_at!,
            executivo: l.executivo_id ? (nameOf.get(l.executivo_id) ?? null) : null,
            conviteEnviado: !!l.meeting_invite_sent_at,
          })),
      };
    }

    // ---- Executivo ----
    let executivo: ExecutivoMetrics | null = null;
    if (show.executivo) {
      const [leads, { data: clients }, { data: tasks }] = await Promise.all([
        fetchAll<LeadLite>((a, b) =>
          supabase
            .from("leads")
            .select(LEAD_COLS)
            .eq("executivo_id", target)
            .or(periodOr)
            .range(a, b),
        ),
        supabase
          .from("cs_clients")
          .select("current_signal")
          .eq("ativo", true)
          .eq("comercial_responsavel_id", target),
        supabase.from("cs_tasks").select("due_at").eq("owner_id", target).eq("status", "pendente"),
      ]);
      const sig = (s: string) => (clients ?? []).filter((c) => c.current_signal === s).length;
      executivo = {
        marcadasParaMim: leads.filter((l) => inRange(l.meeting_booked_at, from, to)).length,
        reunioesNoPeriodo: leads.filter((l) => inRange(l.meeting_at, from, to)).length,
        proximas: leads
          .filter((l) => l.meeting_at && new Date(l.meeting_at) >= now)
          .sort((a, b) => a.meeting_at!.localeCompare(b.meeting_at!))
          .slice(0, 6)
          .map((l) => ({
            id: l.id,
            company: l.company_name ?? "—",
            name: l.name ?? "—",
            meetingAt: l.meeting_at!,
            sdr: l.assigned_to ? (nameOf.get(l.assigned_to) ?? null) : null,
            conviteEnviado: !!l.meeting_invite_sent_at,
          })),
        carteira: {
          total: (clients ?? []).length,
          verde: sig("verde"),
          amarelo: sig("amarelo"),
          vermelho: sig("vermelho"),
        },
        tarefasPendentes: (tasks ?? []).length,
        tarefasAtrasadas: (tasks ?? []).filter((t) => t.due_at && new Date(t.due_at) < now).length,
      };
    }

    // ---- CS ----
    let cs: CsMetrics | null = null;
    if (show.cs) {
      const { data: clients } = await supabase
        .from("cs_clients")
        .select("client_uid, current_signal")
        .eq("ativo", true)
        .eq("cs_responsavel_id", target);
      const uids = (clients ?? []).map((c) => c.client_uid);
      const [{ data: alerts }, { data: tasks }, { data: contatos }] = await Promise.all([
        uids.length
          ? supabase.from("cs_alerts").select("id").eq("status", "open").in("client_uid", uids)
          : Promise.resolve({ data: [] as Array<{ id: string }> }),
        supabase.from("cs_tasks").select("due_at").eq("owner_id", target).eq("status", "pendente"),
        supabase
          .from("cs_timeline_events")
          .select("channel")
          .eq("author_id", target)
          .gte("occurred_at", from.toISOString())
          .lt("occurred_at", to.toISOString())
          .in("channel", ["ligacao", "whatsapp", "email", "reuniao", "presencial"]),
      ]);
      const sig = (s: string) => (clients ?? []).filter((c) => c.current_signal === s).length;
      cs = {
        carteira: {
          total: uids.length,
          verde: sig("verde"),
          amarelo: sig("amarelo"),
          vermelho: sig("vermelho"),
        },
        alertasAbertos: (alerts ?? []).length,
        tarefasPendentes: (tasks ?? []).length,
        tarefasAtrasadas: (tasks ?? []).filter((t) => t.due_at && new Date(t.due_at) < now).length,
        contatosNoPeriodo: (contatos ?? []).length,
        reunioesNoPeriodo: (contatos ?? []).filter((c) => c.channel === "reuniao").length,
      };
    }

    // ---- Time de SDR (gestão) ----
    let team: TeamRow[] | null = null;
    if (show.gestaoSdr && target === me) {
      const sdrIds = [
        ...new Set(
          links
            .filter(
              (l) => l.access.includes("sdr") && teamBySlug.get(l.team)?.modulo === "comercial",
            )
            .map((l) => l.user_id),
        ),
      ];
      if (sdrIds.length) {
        const leads = await fetchAll<LeadLite>((a, b) =>
          supabase
            .from("leads")
            .select(LEAD_COLS)
            .in("assigned_to", sdrIds)
            .or(periodOr)
            .range(a, b),
        );
        team = sdrIds
          .map((id) => {
            const mine = leads.filter((l) => l.assigned_to === id);
            const m = sdrFromLeads(mine, from, to, stages);
            return {
              id,
              name: nameOf.get(id) ?? id,
              novos: m.novos,
              abordados: m.abordados,
              marcadas: m.marcadas,
              taxa: m.taxaAgendamento,
              slaDentroPct: m.slaDentroPct,
            };
          })
          .sort((a, b) => b.marcadas - a.marcadas || b.abordados - a.abordados);
      } else {
        team = [];
      }
    }

    return {
      me: { id: me, name: nameOf.get(me) ?? "", isManager },
      viewing: {
        id: target,
        name: nameOf.get(target) ?? "",
        memberships: targetMemberships.map((m) => ({
          team: teamBySlug.get(m.team)?.nome ?? m.team,
          cor: (teamBySlug.get(m.team)?.cor as string | undefined) ?? "slate",
          access: m.access,
        })),
        isManager: targetIsManager,
      },
      pickable,
      show,
      sdr,
      executivo,
      cs,
      team,
      stageNames: Object.fromEntries(
        stages.map((s) => [s.id, stageById.get(s.id)?.name ?? s.slug]),
      ),
    };
  });
