import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { filtroDoResponsavel } from "@/lib/comercial/responsavel";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hojeSP, inicioDoDiaSP } from "./datas-sp";

/*
 * Blocos de ação do Início: o que pede a pessoa agora, não o que já foi.
 *   - Responder primeiro: leads no nome dela ainda sem 1º contato, do mais antigo;
 *   - Reuniões de hoje: as marcadas por ela ou com ela, e o que a jornada da
 *     agenda já mandou ao lead;
 *   - Leads mais quentes: os abertos de maior pontuação;
 *   - Tarefas de hoje: follow-ups vencendo hoje ou atrasados.
 */
type LeadRow = {
  id: string;
  deal_id: string | null;
  name: string | null;
  company_name: string | null;
  company_size: string | null;
  source: string | null;
  campaign: string | null;
  created_at: string;
  score: number | null;
  meeting_at: string | null;
  meeting_booked_at: string | null;
  executivo_id: string | null;
  assigned_to: string | null;
  next_follow_up_at: string | null;
  next_action: string | null;
  last_touch_channel: string | null;
};

const COLUNAS =
  "id, deal_id, name, company_name, company_size, source, campaign, created_at, score, meeting_at, meeting_booked_at, executivo_id, assigned_to, next_follow_up_at, next_action, last_touch_channel";

// Fora do trabalho de SDR: já agendado, no-show (volta pela cadência) e desqualificado.
const ETAPAS_FORA = ["agendado", "no_show", "desqualificado"];

export const getInicioAcoes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId: me } = context;
    let alvo = me;
    if (data.userId && data.userId !== me) {
      const { data: gestao } = await supabase.rpc("is_manager", { _user_id: me });
      if (!gestao) throw new Error("Só a gestão vê o Início de outra pessoa");
      alvo = data.userId;
    }

    const agora = new Date();
    const inicioHoje = inicioDoDiaSP(hojeSP(agora));
    const fimHoje = new Date(Date.parse(inicioHoje) + 86400_000).toISOString();
    const duasHorasAtras = new Date(agora.getTime() - 2 * 3600_000).toISOString();

    const { data: etapas } = await supabase.from("stages").select("id, slug");
    const fora = (etapas ?? []).filter((e) => ETAPAS_FORA.includes(e.slug)).map((e) => e.id);
    const foraFiltro = fora.length ? `(${fora.join(",")})` : null;

    const base = () => {
      let q = supabase
        .from("leads")
        .select(COLUNAS)
        .eq("assigned_to", alvo)
        .eq("oculto_sdr", false);
      if (foraFiltro) q = q.not("stage_id", "in", foraFiltro);
      return q;
    };
    const contar = () => {
      let q = supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("assigned_to", alvo)
        .eq("oculto_sdr", false)
        .is("first_approach_at", null);
      if (foraFiltro) q = q.not("stage_id", "in", foraFiltro);
      return q;
    };

    const [responder, semContato, atrasados, quentes, tarefas, reunioes] = await Promise.all([
      base().is("first_approach_at", null).order("created_at", { ascending: true }).limit(5),
      contar(),
      contar().lt("created_at", duasHorasAtras),
      base().not("score", "is", null).order("score", { ascending: false }).limit(4),
      base()
        .not("next_follow_up_at", "is", null)
        .lt("next_follow_up_at", fimHoje)
        .order("next_follow_up_at", { ascending: true })
        .limit(6),
      supabase
        .from("leads")
        .select(COLUNAS)
        .or(`assigned_to.eq.${alvo},executivo_id.eq.${alvo}`)
        .gte("meeting_at", inicioHoje)
        .lt("meeting_at", fimHoje)
        .order("meeting_at", { ascending: true })
        .limit(8),
    ]);

    // O que a jornada da agenda já mandou para cada reunião de hoje.
    const reunioesHoje = (reunioes.data ?? []) as LeadRow[];
    const { data: envios } = reunioesHoje.length
      ? await supabase
          .from("sdr_jornada_envios" as never)
          .select("lead_id, passo, reuniao_em, status")
          .in(
            "lead_id",
            reunioesHoje.map((l) => l.id),
          )
      : { data: [] };
    const enviados = new Map<string, string[]>();
    for (const e of (envios ?? []) as Array<{
      lead_id: string;
      passo: string;
      reuniao_em: string;
      status: string;
    }>) {
      const lead = reunioesHoje.find((l) => l.id === e.lead_id);
      if (e.status !== "enviado" || !lead?.meeting_at) continue;
      if (Date.parse(e.reuniao_em) !== Date.parse(lead.meeting_at)) continue;
      enviados.set(e.lead_id, [...(enviados.get(e.lead_id) ?? []), e.passo]);
    }

    /*
     * Reuniões que o executivo marca direto: as do negócio (reuniao_em, quando
     * não vieram de um lead do SDR já listado) e as da Google Agenda ligada,
     * com convidado de fora da Grou. Antes só contava a reunião do SDR.
     */
    const dealsJaListados = new Set(
      ((reunioes.data ?? []) as LeadRow[]).map((l) => l.deal_id).filter(Boolean) as string[],
    );
    const [{ data: negocios }, { data: agenda }] = await Promise.all([
      supabase
        .from("deals")
        .select("id, nome, reuniao_em, companies:company_id(nome)")
        .or(filtroDoResponsavel(alvo))
        .gte("reuniao_em", inicioHoje)
        .lt("reuniao_em", fimHoje)
        .order("reuniao_em")
        .limit(8),
      supabase
        .from("cs_calendly_events")
        .select("id, name, status, start_time, invitee_name, invitee_email")
        .eq("user_id", alvo)
        .gte("start_time", inicioHoje)
        .lt("start_time", fimHoje)
        .order("start_time")
        .limit(12),
    ]);
    const doExecutivo = [
      ...(
        (negocios ?? []) as Array<{
          id: string;
          nome: string | null;
          reuniao_em: string;
          companies: { nome: string | null } | null;
        }>
      )
        .filter((n) => !dealsJaListados.has(n.id))
        .map((n) => ({
          id: n.id,
          link: "negocio" as const,
          nome: n.nome,
          empresa: n.companies?.nome ?? null,
          em: n.reuniao_em,
          origem: "Negócio",
        })),
      ...(
        (agenda ?? []) as Array<{
          id: string;
          name: string | null;
          status: string | null;
          start_time: string;
          invitee_name: string | null;
          invitee_email: string | null;
        }>
      )
        .filter(
          (e) =>
            e.status !== "canceled" &&
            !!e.invitee_email &&
            !/@grougp\.com\.br$/i.test(e.invitee_email),
        )
        .map((e) => ({
          id: e.id,
          link: "agenda" as const,
          nome: e.name,
          empresa: e.invitee_name || e.invitee_email,
          em: e.start_time,
          origem: "Google Agenda",
        })),
    ];

    const idsExec = [...new Set(reunioesHoje.map((l) => l.executivo_id).filter(Boolean))];
    const { data: perfis } = idsExec.length
      ? await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", idsExec as string[])
      : { data: [] };
    const nome = new Map((perfis ?? []).map((p) => [p.id, p.full_name ?? ""]));

    return {
      semContato: semContato.count ?? 0,
      semContatoAtrasados: atrasados.count ?? 0,
      responder: ((responder.data ?? []) as LeadRow[]).map((l) => ({
        id: l.id,
        nome: l.name,
        empresa: l.company_name,
        origem: l.campaign || l.source,
        desde: l.created_at,
      })),
      reunioesHoje: [
        ...reunioesHoje.map((l) => ({
          id: l.id,
          link: "lead" as "lead" | "negocio" | "agenda",
          nome: l.name,
          empresa: l.company_name,
          em: l.meeting_at!,
          executivo: l.executivo_id ? (nome.get(l.executivo_id) ?? null) : null,
          jornada: enviados.get(l.id) ?? [],
          origem: null as string | null,
        })),
        ...doExecutivo.map((r) => ({ ...r, executivo: null, jornada: [] as string[] })),
      ].sort((a, b) => a.em.localeCompare(b.em)),
      quentes: ((quentes.data ?? []) as LeadRow[]).map((l) => ({
        id: l.id,
        nome: l.name,
        empresa: l.company_name,
        porte: l.company_size,
        score: l.score ?? 0,
      })),
      tarefas: ((tarefas.data ?? []) as LeadRow[]).map((l) => ({
        id: l.id,
        nome: l.name,
        empresa: l.company_name,
        quando: l.next_follow_up_at!,
        acao: l.next_action,
        canal: l.last_touch_channel,
        atrasada: Date.parse(l.next_follow_up_at!) < Date.parse(inicioHoje),
      })),
    };
  });
