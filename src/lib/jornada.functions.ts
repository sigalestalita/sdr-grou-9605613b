import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
 * Jornada de ponta a ponta de um cliente.
 *
 * Junta numa linha só o que cada módulo sabe sobre a mesma empresa: o lead que
 * o SDR trabalhou, o negócio que o comercial fechou, o check do ADM e o
 * faturamento, e o atendimento do CS. A empresa (companies) é a entidade que
 * os três compartilham, então é por ela que a costura acontece.
 */

export type EtapaJornada = {
  id: string;
  modulo: "sdr" | "comercial" | "adm" | "cs";
  titulo: string;
  detalhe: string | null;
  em: string | null;
  /** Quem fez, quando dá para saber. */
  quem: string | null;
  /** Dias desde a etapa anterior. */
  desdeAnterior: number | null;
};

export const MODULO_LABEL: Record<EtapaJornada["modulo"], string> = {
  sdr: "SDR",
  comercial: "Comercial",
  adm: "ADM / Financeiro",
  cs: "Customer Success",
};

const dias = (de: string | null, ate: string | null) => {
  if (!de || !ate) return null;
  return Math.round((new Date(ate).getTime() - new Date(de).getTime()) / 86400000);
};

/** Empresas que já percorreram mais de um módulo, para o seletor da tela. */
export const listEmpresasComJornada = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("companies")
      .select("id, uid, nome, segmento, exemplo")
      .eq("ativo", true)
      .order("exemplo", { ascending: false })
      .order("nome")
      .limit(300);
    if (error) throw new Error(error.message);
    return { empresas: data ?? [] };
  });

export const getJornadaCliente = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({ companyId: z.string().uuid().optional(), uid: z.string().optional() })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    let q = supabase
      .from("companies")
      .select(
        "id, uid, nome, cnpj, segmento, porte, num_funcionarios, cidade, estado, site_url, exemplo",
      );
    q = data.companyId ? q.eq("id", data.companyId) : q.eq("uid", data.uid ?? "");
    const { data: empresa, error } = await q.maybeSingle();
    if (error) throw new Error(error.message);
    if (!empresa) throw new Error("Empresa não encontrada");

    const [{ data: leads }, { data: deals }, { data: clientes }, { data: profiles }] =
      await Promise.all([
        supabase
          .from("leads")
          .select(
            "id, name, email, phone, position, source, campaign, form_name, assigned_to, executivo_id, created_at, first_approach_at, meeting_booked_at, meeting_at, converted_at, touch_count, bant, score, priority, deal_id",
          )
          .eq("company_id", empresa.id)
          .order("created_at"),
        supabase
          .from("deals")
          .select(
            "id, nome, status, amount, executivo_user_id, sdr_user_id, pipeline_id, temperatura, fonte, campanha, tipo_venda, agendado_em, reuniao_em, devolutiva_em, proposta_aceita_em, ordem_compra_em, ordem_compra_numero, contrato_assinado_em, adm_checked_at, faturado_em, cs_entregue_em, closed_at, lost_reason, observacao_adm, esteira, created_at",
          )
          .eq("company_id", empresa.id)
          .order("created_at"),
        supabase
          .from("cs_clients")
          .select(
            "client_uid, nome_empresa, journey_stage, current_signal, health_score, cs_responsavel_id, comercial_responsavel_id, data_inicio_contrato, data_renovacao, aporte_valor, last_contact_at, pda_consumo_pct",
          )
          .eq("company_id", empresa.id),
        supabase.from("profiles").select("id, full_name, email"),
      ]);

    const nomeDe = (id: string | null | undefined) => {
      if (!id) return null;
      const p = (profiles ?? []).find((x: { id: string }) => x.id === id);
      return p ? p.full_name || p.email || null : null;
    };

    const lead = (leads ?? [])[0] as Record<string, unknown> | undefined;
    // O negócio ganho manda; sem ele, o mais recente.
    const negocios = (deals ?? []) as Array<Record<string, unknown>>;
    const deal = negocios.find((d) => d.status === "won") ?? negocios[0];
    const cliente = (clientes ?? [])[0] as Record<string, unknown> | undefined;

    const etapas: EtapaJornada[] = [];
    const push = (e: Omit<EtapaJornada, "desdeAnterior">) => {
      if (!e.em) return;
      const anterior = etapas.length ? etapas[etapas.length - 1].em : null;
      etapas.push({ ...e, desdeAnterior: dias(anterior, e.em) });
    };

    if (lead) {
      const sdr = nomeDe(lead.assigned_to as string);
      push({
        id: "lead-entrou",
        modulo: "sdr",
        titulo: "Lead entrou",
        detalhe: [lead.source, lead.campaign, lead.form_name].filter(Boolean).join(" · ") || null,
        em: (lead.created_at as string) ?? null,
        quem: sdr,
      });
      push({
        id: "lead-abordado",
        modulo: "sdr",
        titulo: "Primeiro contato",
        detalhe: lead.first_approach_at
          ? `${dias(lead.created_at as string, lead.first_approach_at as string) === 0 ? "No mesmo dia" : "Depois da entrada"} · ${lead.touch_count ?? 0} toques no total`
          : null,
        em: (lead.first_approach_at as string) ?? null,
        quem: sdr,
      });
      push({
        id: "agenda-marcada",
        modulo: "sdr",
        titulo: "Agenda marcada",
        detalhe: "SDR qualificou e passou a reunião para o executivo",
        em: (lead.meeting_booked_at as string) ?? null,
        quem: sdr,
      });
    }

    if (deal) {
      const exec = nomeDe(deal.executivo_user_id as string);
      push({
        id: "reuniao",
        modulo: "comercial",
        titulo: "Reunião com o executivo",
        detalhe: deal.tipo_venda ? String(deal.tipo_venda) : null,
        em: (deal.reuniao_em as string) ?? null,
        quem: exec,
      });
      push({
        id: "devolutiva",
        modulo: "comercial",
        titulo: "Devolutiva entregue",
        detalhe: null,
        em: (deal.devolutiva_em as string) ?? null,
        quem: exec,
      });
      push({
        id: "proposta",
        modulo: "comercial",
        titulo: "Proposta aceita",
        detalhe: "Aceite não conta como venda: o que vale é a ordem de compra",
        em: (deal.proposta_aceita_em as string) ?? null,
        quem: exec,
      });
      push({
        id: "contrato",
        modulo: "comercial",
        titulo: "Contrato assinado",
        detalhe: null,
        em: (deal.contrato_assinado_em as string) ?? null,
        quem: exec,
      });
      push({
        id: "oc",
        modulo: "comercial",
        titulo: "Ordem de compra",
        detalhe: deal.ordem_compra_numero
          ? `${deal.ordem_compra_numero} · aqui a venda vira ganha`
          : "Aqui a venda vira ganha",
        em: (deal.ordem_compra_em as string) ?? null,
        quem: exec,
      });
      push({
        id: "adm",
        modulo: "adm",
        titulo: "ADM validou",
        detalhe: "O check do ADM libera o cliente para o faturamento",
        em: (deal.adm_checked_at as string) ?? null,
        quem: nomeDe(deal.adm_checked_by as string),
      });
      push({
        id: "faturado",
        modulo: "adm",
        titulo: "Faturado",
        detalhe: null,
        em: (deal.faturado_em as string) ?? null,
        quem: null,
      });
      push({
        id: "cs-entregue",
        modulo: "cs",
        titulo: "Bastão passado ao CS",
        detalhe: "Passagem pelo registro no CRM, sem contato direto entre os times",
        em: (deal.cs_entregue_em as string) ?? null,
        quem: null,
      });
    }

    // Atendimento do CS
    let timeline: Array<Record<string, unknown>> = [];
    if (cliente) {
      const { data: eventos } = await supabase
        .from("cs_timeline_events")
        .select("id, event_type, channel, title, description, author_id, occurred_at")
        .eq("client_uid", cliente.client_uid as string)
        .order("occurred_at");
      timeline = (eventos ?? []) as Array<Record<string, unknown>>;
      for (const e of timeline) {
        push({
          id: `cs-${e.id}`,
          modulo: "cs",
          titulo: String(e.title ?? "Atendimento"),
          detalhe: (e.description as string) ?? null,
          em: (e.occurred_at as string) ?? null,
          quem: nomeDe(e.author_id as string),
        });
      }
    }

    const primeiro = etapas[0]?.em ?? null;
    const ultimo = etapas[etapas.length - 1]?.em ?? null;

    const str = (v: unknown) => (v == null ? null : String(v));
    const num = (v: unknown) => (v == null ? null : Number(v));

    return {
      empresa,
      lead: lead
        ? {
            name: str(lead.name),
            position: str(lead.position),
            email: str(lead.email),
            score: num(lead.score),
            priority: str(lead.priority),
            touchCount: num(lead.touch_count),
            sdrNome: nomeDe(lead.assigned_to as string),
            executivoNome: nomeDe(lead.executivo_id as string),
          }
        : null,
      deal: deal
        ? {
            nome: str(deal.nome),
            status: str(deal.status),
            amount: num(deal.amount),
            tipo_venda: str(deal.tipo_venda),
            ordem_compra_numero: str(deal.ordem_compra_numero),
            observacao_adm: str(deal.observacao_adm),
            esteira: str(deal.esteira),
            executivoNome: nomeDe(deal.executivo_user_id as string),
            sdrNome: nomeDe(deal.sdr_user_id as string),
          }
        : null,
      cliente: cliente
        ? {
            client_uid: str(cliente.client_uid),
            journey_stage: str(cliente.journey_stage),
            current_signal: str(cliente.current_signal),
            health_score: num(cliente.health_score),
            data_renovacao: str(cliente.data_renovacao),
            data_inicio_contrato: str(cliente.data_inicio_contrato),
            pda_consumo_pct: num(cliente.pda_consumo_pct),
            csNome: nomeDe(cliente.cs_responsavel_id as string),
            comercialNome: nomeDe(cliente.comercial_responsavel_id as string),
          }
        : null,
      etapas,
      totalEventosCs: timeline.length,
      duracaoDias: dias(primeiro, ultimo),
      /** Da entrada do lead até a ordem de compra: o ciclo de venda. */
      cicloVendaDias: dias(
        (lead?.created_at as string) ?? null,
        (deal?.ordem_compra_em as string) ?? (deal?.closed_at as string) ?? null,
      ),
      /** Da ordem de compra até chegar ao CS: o tempo do ADM. */
      cicloAdmDias: dias(
        (deal?.ordem_compra_em as string) ?? null,
        (deal?.cs_entregue_em as string) ?? null,
      ),
    };
  });
