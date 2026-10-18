import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/*
 * Agenda do executivo comercial.
 *
 * Vale a mesma ligação que o CS já usa: cada pessoa cola o endereço iCal
 * privado da própria Google Agenda e os eventos caem em cs_calendly_events.
 * A diferença aqui é o que a agenda precisa mostrar, que não é só o Google:
 *
 *  - o que veio do Google (reuniões que o executivo marcou por fora);
 *  - o que o SDR agendou no CRM (leads.meeting_at), que é o motivo de a
 *    integração existir — o convite sai por e-mail, mas a reunião tem que
 *    aparecer no sistema mesmo antes de o Google sincronizar, e continua
 *    aparecendo se a pessoa ainda nem ligou a agenda;
 *  - as reuniões de negócios da carteira (deals.reuniao_em).
 *
 * A gestão comercial vê todos os executivos na mesma tela; o executivo vê a
 * própria agenda.
 */

export type AgendaEvento = {
  id: string;
  executivoId: string;
  titulo: string;
  inicio: string;
  fim: string | null;
  origem: "google" | "sdr" | "negocio";
  meetUrl: string | null;
  local: string | null;
  empresa: string | null;
  convidado: string | null;
  leadId: string | null;
  dealId: string | null;
  cancelado: boolean;
};

/** Quem é executivo comercial: o papel derivado dos vínculos de time. */
async function executivosComerciais(): Promise<
  Array<{ userId: string; name: string; email: string | null }>
> {
  const [{ data: roles }, { data: profiles }] = await Promise.all([
    supabaseAdmin.from("user_roles").select("user_id").eq("role", "executivo"),
    supabaseAdmin.from("profiles").select("id, full_name, email"),
  ]);
  const ids = new Set((roles ?? []).map((r) => r.user_id as string));
  return (profiles ?? [])
    .filter((p) => ids.has(p.id as string))
    .map((p) => ({
      userId: p.id as string,
      name: (p.full_name || p.email || p.id) as string,
      email: (p.email as string | null) ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export const getComercialAgenda = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        from: z.string(),
        to: z.string(),
        executivoId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { assertCsAccess, listIntegrationStatus } = await import("@/lib/cs/integrations.server");
    // assertCsAccess já deixa o executivo comercial entrar: é ele quem liga a
    // própria agenda para receber os convites do SDR.
    const access = await assertCsAccess(context.userId);

    const executivos = await executivosComerciais();
    const souExecutivo = executivos.some((e) => e.userId === context.userId);
    // Gestão vê o time; executivo vê a si mesmo. Quem não é nem um nem outro
    // (um SDR curioso) cai na própria agenda, que estará vazia.
    const alvos = access.isManager
      ? data.executivoId
        ? [data.executivoId]
        : executivos.map((e) => e.userId)
      : [context.userId];

    const [{ data: gcal }, { data: leads }, { data: negocios }, integracoes] = await Promise.all([
      supabaseAdmin
        .from("cs_calendly_events")
        .select(
          "id, user_id, name, status, start_time, end_time, location, meeting_url, invitee_name, invitee_email",
        )
        .in("user_id", alvos)
        .gte("start_time", data.from)
        .lte("start_time", data.to)
        .order("start_time"),
      supabaseAdmin
        .from("leads")
        .select(
          "id, name, company_name, executivo_id, meeting_at, meeting_duration_min, meeting_invite_sent_at, deal_id",
        )
        .in("executivo_id", alvos)
        .gte("meeting_at", data.from)
        .lte("meeting_at", data.to),
      supabaseAdmin
        .from("deals")
        .select("id, nome, executivo_user_id, reuniao_em, companies:company_id(nome)")
        .in("executivo_user_id", alvos)
        .gte("reuniao_em", data.from)
        .lte("reuniao_em", data.to),
      listIntegrationStatus(executivos.map((e) => e.userId)),
    ]);

    const eventos: AgendaEvento[] = [];

    for (const e of gcal ?? []) {
      eventos.push({
        id: `g:${e.id}`,
        executivoId: e.user_id as string,
        titulo: (e.name as string | null) ?? "Compromisso",
        inicio: e.start_time as string,
        fim: (e.end_time as string | null) ?? null,
        origem: "google",
        meetUrl: (e.meeting_url as string | null) ?? null,
        local: (e.location as string | null) ?? null,
        empresa: null,
        convidado: (e.invitee_name as string | null) ?? (e.invitee_email as string | null) ?? null,
        leadId: null,
        dealId: null,
        cancelado: e.status === "canceled",
      });
    }

    for (const l of leads ?? []) {
      if (!l.meeting_at) continue;
      const inicio = new Date(l.meeting_at as string);
      const min = (l.meeting_duration_min as number | null) ?? 60;
      eventos.push({
        id: `l:${l.id}`,
        executivoId: l.executivo_id as string,
        titulo: `Reunião com ${(l.company_name as string | null) ?? (l.name as string | null) ?? "lead"}`,
        inicio: inicio.toISOString(),
        fim: new Date(inicio.getTime() + min * 60000).toISOString(),
        origem: "sdr",
        meetUrl: null,
        local: null,
        empresa: (l.company_name as string | null) ?? null,
        convidado: (l.name as string | null) ?? null,
        leadId: l.id as string,
        dealId: (l.deal_id as string | null) ?? null,
        cancelado: false,
      });
    }

    // O negócio que nasceu da reunião do SDR repete a mesma reunião: mostra uma vez.
    const jaNaAgenda = new Set(
      (leads ?? []).map((l) => l.deal_id as string | null).filter((x): x is string => !!x),
    );

    for (const n of negocios ?? []) {
      if (!n.reuniao_em || jaNaAgenda.has(n.id as string)) continue;
      const inicio = new Date(n.reuniao_em as string);
      const empresa = (n.companies as { nome?: string | null } | null)?.nome ?? null;
      eventos.push({
        id: `d:${n.id}`,
        executivoId: n.executivo_user_id as string,
        titulo: (n.nome as string | null) ?? "Reunião de negócio",
        inicio: inicio.toISOString(),
        fim: new Date(inicio.getTime() + 3600000).toISOString(),
        origem: "negocio",
        meetUrl: null,
        local: null,
        empresa,
        convidado: null,
        leadId: null,
        dealId: n.id as string,
        cancelado: false,
      });
    }

    eventos.sort((a, b) => a.inicio.localeCompare(b.inicio));

    const statusPorId = new Map(integracoes.map((i) => [i.userId, i]));
    return {
      isManager: access.isManager,
      souExecutivo,
      meuId: context.userId,
      eventos,
      executivos: executivos.map((e) => {
        const i = statusPorId.get(e.userId);
        return {
          ...e,
          conectado: !!i?.gcalConnected,
          ultimaSync: i?.gcalLastSyncAt ?? null,
          erro: i?.gcalLastError ?? null,
          meetingUrl: i?.meetingUrl ?? null,
        };
      }),
      minhaIntegracao: statusPorId.get(context.userId) ?? null,
    };
  });
