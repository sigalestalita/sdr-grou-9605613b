import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildCadencePlan, resolveTrack, stepIdFromTouchMetadata } from "./sdr-cadence";
import type { LeadNaCadencia } from "./fup-agenda";

/** Mesma janela do quadro de Cadência: trilha mais longa termina bem antes disso. */
const JANELA_CADENCIA_DIAS = 75;

const CAMPOS_CADENCIA =
  "id, name, company_name, phone, assigned_to, stage_id, priority, lead_type, touch_count, last_touch_at, last_touch_channel, created_at, converted_at, company_size, linkedin_company_size, cadence_track, cadence_started_at, cadence_status";

/** Agenda/cronograma de follow-ups: manuais (touches) + automáticos (sequências de FUP). */
export const getFupAgenda = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        from: z.string(),
        to: z.string(),
        assignedTo: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const from = new Date(data.from).toISOString();
    const to = new Date(data.to).toISOString();

    const [profilesRes, stagesRes, leadsRes, enrollRes, touchesRes, cadenciaRes] =
      await Promise.all([
        supabase.from("profiles").select("id, full_name, email"),
        supabase.from("stages").select("id, name, slug, color, is_terminal"),
        supabase
          .from("leads")
          .select(
            "id, name, company_name, phone, email, lead_type, priority, stage_id, assigned_to, touch_count, last_touch_at, last_touch_channel, last_touch_outcome, next_follow_up_at",
          )
          .not("next_follow_up_at", "is", null)
          .lte("next_follow_up_at", to)
          .limit(5000),
        supabase
          .from("whatsapp_fup_enrollments")
          .select(
            "id, sequence_id, lead_id, status, current_step, next_run_at, whatsapp_fup_sequences:sequence_id(name), leads:lead_id(id, name, company_name, phone, assigned_to, stage_id, priority, lead_type, touch_count, last_touch_at, last_touch_channel)",
          )
          .eq("status", "active")
          .not("next_run_at", "is", null)
          .lte("next_run_at", to)
          .limit(5000),
        // Touches registrados como "Follow-up" com data/hora, mas sem próximo agendamento:
        // eles também são compromissos da agenda até serem marcados como feitos.
        supabase
          .from("lead_touches")
          .select(
            "id, lead_id, channel, outcome, occurred_at, touch_number, author_id, next_follow_up_at, follow_up_done_at, follow_up_done_by, leads:lead_id(id, name, company_name, phone, assigned_to, stage_id, priority, lead_type, touch_count, last_touch_at, last_touch_channel)",
          )
          .or("action_type.eq.follow_up,follow_up_done_at.not.is.null")
          /*
           * Teto sem ordenação devolve 5000 linhas quaisquer — e quais ficam
           * muda a cada leitura. Ordenado, o corte passa a ser sempre o mesmo
           * e sempre pelo mais antigo, que é o que menos importa aqui. O
           * desempate por id é obrigatório: occurred_at repete.
           */
          .order("occurred_at", { ascending: false })
          .order("id", { ascending: true })
          .limit(5000),
        /*
         * Os passos da trilha do playbook.
         *
         * A agenda nascia sem eles: mostrava só o que alguém tinha agendado à
         * mão e as sequências de WhatsApp. Só que o card do lead monta a trilha
         * sozinho, do startAt, e mostra D1, D3, D5 — então a SDR via uma lista
         * cheia no card e quatro itens na agenda, e concluía (com razão) que a
         * agenda estava quebrada. Agora as duas leem a mesma coisa.
         *
         * Os filtros são os mesmos do quadro de Cadência, inclusive o
         * `cadence_status.is.null`, que ali já custou caro: `neq` sozinho
         * derruba quem tem o campo nulo, que é todo lead cuja cadência nunca
         * foi iniciada no botão.
         */
        supabase
          .from("leads")
          .select(CAMPOS_CADENCIA)
          .or("cadence_status.is.null,cadence_status.neq.encerrada")
          .gte("created_at", new Date(Date.now() - JANELA_CADENCIA_DIAS * 86400000).toISOString())
          .or("source.is.null,source.neq.campaign_upload")
          .limit(4000),
      ]);
    if (leadsRes.error) throw new Error(leadsRes.error.message);

    const stages = stagesRes.data ?? [];
    const stageById = new Map(stages.map((s) => [s.id, s]));
    const profiles = profilesRes.data ?? [];
    const nameById = new Map(profiles.map((p) => [p.id, p.full_name || p.email || "—"]));

    type Item = {
      key: string;
      kind: "manual" | "auto" | "touch";
      touchId?: string;
      done: boolean;
      doneAt?: string | null;
      doneByName?: string | null;
      dueAt: string;
      leadId: string;
      leadName: string;
      company: string | null;
      phone: string | null;
      priority: string | null;
      leadType: string | null;
      stageName: string | null;
      assignedTo: string | null;
      assignedName: string;
      touchCount: number;
      lastTouchAt: string | null;
      lastTouchChannel: string | null;
      title: string;
      subtitle: string | null;
    };

    const items: Item[] = [];

    for (const l of leadsRes.data ?? []) {
      const stage = l.stage_id ? stageById.get(l.stage_id) : null;
      if (stage?.is_terminal) continue;
      items.push({
        key: `manual:${l.id}`,
        kind: "manual",
        done: false,
        dueAt: l.next_follow_up_at as string,
        leadId: l.id,
        leadName: l.name,
        company: l.company_name,
        phone: l.phone,
        priority: l.priority,
        leadType: l.lead_type,
        stageName: stage?.name ?? null,
        assignedTo: l.assigned_to,
        assignedName: l.assigned_to ? (nameById.get(l.assigned_to) ?? "—") : "Fila geral",
        touchCount: l.touch_count ?? 0,
        lastTouchAt: l.last_touch_at,
        lastTouchChannel: l.last_touch_channel,
        title: `Touch ${(l.touch_count ?? 0) + 1} — follow-up manual`,
        subtitle: l.last_touch_channel ? `Último contato: ${l.last_touch_channel}` : null,
      });
    }

    type Enr = {
      id: string;
      current_step: number;
      next_run_at: string;
      whatsapp_fup_sequences: { name: string } | null;
      leads: {
        id: string;
        name: string;
        company_name: string | null;
        phone: string | null;
        assigned_to: string | null;
        stage_id: string | null;
        priority: string | null;
        lead_type: string | null;
        touch_count: number | null;
        last_touch_at: string | null;
        last_touch_channel: string | null;
      } | null;
    };
    for (const e of (enrollRes.data ?? []) as unknown as Enr[]) {
      const l = e.leads;
      if (!l) continue;
      const stage = l.stage_id ? stageById.get(l.stage_id) : null;
      items.push({
        key: `auto:${e.id}`,
        kind: "auto",
        done: false,
        dueAt: e.next_run_at,
        leadId: l.id,
        leadName: l.name,
        company: l.company_name,
        phone: l.phone,
        priority: l.priority,
        leadType: l.lead_type,
        stageName: stage?.name ?? null,
        assignedTo: l.assigned_to,
        assignedName: l.assigned_to ? (nameById.get(l.assigned_to) ?? "—") : "Fila geral",
        touchCount: l.touch_count ?? 0,
        lastTouchAt: l.last_touch_at,
        lastTouchChannel: l.last_touch_channel,
        title: `FUP automático — passo ${(e.current_step ?? 0) + 1}`,
        subtitle: e.whatsapp_fup_sequences?.name ?? null,
      });
    }

    type TouchRow = {
      id: string;
      channel: string;
      outcome: string | null;
      occurred_at: string;
      touch_number: number | null;
      next_follow_up_at: string | null;
      follow_up_done_at: string | null;
      follow_up_done_by: string | null;
      leads: Enr["leads"];
    };
    for (const t of (touchesRes.data ?? []) as unknown as TouchRow[]) {
      const l = t.leads;
      if (!l) continue;
      const stage = l.stage_id ? stageById.get(l.stage_id) : null;
      if (stage?.is_terminal) continue;
      const done = !!t.follow_up_done_at;
      // pendentes com data agendada já vêm pelo resumo do lead
      if (!done && t.next_follow_up_at) continue;
      const dueAt = t.next_follow_up_at ?? t.occurred_at;
      if (dueAt > to) continue;
      if (done && dueAt < from) continue; // realizados só dentro da semana visível
      items.push({
        key: `touch:${t.id}`,
        kind: "touch",
        touchId: t.id,
        done,
        doneAt: t.follow_up_done_at,
        doneByName: t.follow_up_done_by ? (nameById.get(t.follow_up_done_by) ?? null) : null,
        dueAt,
        leadId: l.id,
        leadName: l.name,
        company: l.company_name,
        phone: l.phone,
        priority: l.priority,
        leadType: l.lead_type,
        stageName: stage?.name ?? null,
        assignedTo: l.assigned_to,
        assignedName: l.assigned_to ? (nameById.get(l.assigned_to) ?? "—") : "Fila geral",
        touchCount: l.touch_count ?? 0,
        lastTouchAt: l.last_touch_at,
        lastTouchChannel: l.last_touch_channel,
        title: `Touch ${t.touch_number ?? "?"} — follow-up (${t.channel})`,
        subtitle: t.outcome ? `Resultado: ${t.outcome}` : null,
      });
    }

    /*
     * Monta a trilha de cada lead e joga na agenda o que é acionável.
     *
     * Acionável, aqui, não é "todo passo pendente": um lead largado há duas
     * semanas tem cinco ou seis passos vencidos, e despejar todos encheria a
     * tela de ruído — a SDR não vai fazer os cinco, vai fazer o próximo. Então
     * de atrasado entra só o primeiro passo vencido de cada lead, que é o
     * ponto onde ela precisa retomar, e de agendado entram os passos que caem
     * dentro da semana visível.
     */
    const leadsCadencia = (cadenciaRes.data ?? []).filter((l) => {
      const stage = l.stage_id ? stageById.get(l.stage_id) : null;
      return !stage?.is_terminal && l.cadence_status !== "pausada";
    });

    const passosFeitos = new Map<string, Record<string, string>>();
    const ids = leadsCadencia.map((l) => l.id);
    for (let i = 0; i < ids.length; i += 500) {
      const res = await supabase
        .from("lead_touches")
        .select("lead_id, occurred_at, metadata")
        .in("lead_id", ids.slice(i, i + 500))
        .order("occurred_at", { ascending: true })
        .limit(20000);
      for (const t of res.data ?? []) {
        const stepId = stepIdFromTouchMetadata(t.metadata);
        if (!stepId) continue;
        const mapa = passosFeitos.get(t.lead_id) ?? {};
        if (!mapa[stepId]) mapa[stepId] = t.occurred_at;
        passosFeitos.set(t.lead_id, mapa);
      }
    }

    /*
     * Um objeto por lead, com a trilha inteira dele — nunca um item por toque.
     *
     * A agenda desenhava cada toque como um card na coluna do dia, e o mesmo
     * lead aparecia quatro vezes numa quarta e de novo na quinta e na sexta. A
     * tela agora decide como mostrar (fila de hoje, matriz da semana, lista de
     * atrasados) a partir do lead inteiro. Título, canal e roteiro de cada
     * passo não viajam: a tela tira do playbook pelo id, e a resposta fica
     * pequena mesmo com a carteira de todas as SDRs.
     *
     * Entra quem tem algo a fazer até o fim da semana visível, ou fez algo
     * dentro dela. Lead cuja trilha só começa depois não tem o que mostrar.
     */
    const cadencia: LeadNaCadencia[] = [];
    for (const l of leadsCadencia) {
      const startAt = l.cadence_started_at ?? l.converted_at ?? l.created_at;
      if (!startAt) continue;
      const plan = buildCadencePlan({
        track: resolveTrack(l),
        startAt,
        doneMap: passosFeitos.get(l.id) ?? {},
      });
      const relevante = plan.steps.some((p) =>
        p.doneAt ? p.doneAt >= from && p.doneAt <= to : p.dueAt <= to,
      );
      if (!relevante) continue;
      const stage = l.stage_id ? stageById.get(l.stage_id) : null;
      cadencia.push({
        leadId: l.id,
        leadName: l.name,
        company: l.company_name,
        phone: l.phone,
        priority: l.priority,
        stageName: stage?.name ?? null,
        assignedTo: l.assigned_to,
        assignedName: l.assigned_to ? (nameById.get(l.assigned_to) ?? "—") : "Fila geral",
        touchCount: l.touch_count ?? 0,
        track: plan.track,
        passos: plan.steps.map((p) => ({ id: p.id, dueAt: p.dueAt, doneAt: p.doneAt })),
      });
    }

    const filtered = data.assignedTo
      ? items.filter((i) => i.assignedTo === data.assignedTo)
      : items;
    const overdue = filtered
      .filter((i) => !i.done && i.dueAt < from)
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    const scheduled = filtered
      .filter((i) => i.dueAt >= from)
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt));

    return {
      period: { from, to },
      currentUserId: userId,
      profiles,
      overdue,
      scheduled,
      cadencia: data.assignedTo
        ? cadencia.filter((c) => c.assignedTo === data.assignedTo)
        : cadencia,
    };
  });

/** Conclui manualmente um passo de FUP automático (encerra a inscrição na sequência). */
export const completeAutoFup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ enrollmentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("whatsapp_fup_enrollments")
      .update({
        status: "completed_manual",
        completed_at: new Date().toISOString(),
        next_run_at: null,
      })
      .eq("id", data.enrollmentId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
