import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/*
 * Histórico do lead no estilo do RD: tudo o que aconteceu com a pessoa, de
 * qualquer origem (migração do RD, campanha, cadastro manual), numa linha do
 * tempo só. Junta os registros de todos os leads da mesma pessoa (mesmo
 * contato ou mesmo e-mail), porque a mesma pessoa pode ter entrado mais de
 * uma vez.
 *
 * Lê com a chave do servidor: lead fora do kanban (base de marketing, cards do
 * RD) fica escondido pela regra de acesso, mas o histórico tem que abrir.
 */

export type TipoEvento =
  | "conversao"
  | "negocio"
  | "anotacao"
  | "tarefa"
  | "etapa"
  | "contato"
  | "whatsapp"
  | "reuniao"
  | "proposta"
  | "sistema";

export type EventoHistorico = {
  id: string;
  tipo: TipoEvento;
  titulo: string;
  detalhe: string | null;
  quando: string;
  autor: string | null;
  /** Negócio relacionado, para abrir. */
  dealId: string | null;
};

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null || v === "" ? null : String(v));

const TIPO_ATIVIDADE: Record<string, { tipo: TipoEvento; rotulo: string }> = {
  nota: { tipo: "anotacao", rotulo: "Anotação no negócio" },
  email: { tipo: "contato", rotulo: "E-mail" },
  ligacao: { tipo: "contato", rotulo: "Ligação" },
  whatsapp: { tipo: "whatsapp", rotulo: "WhatsApp" },
  reuniao: { tipo: "reuniao", rotulo: "Reunião" },
  proposta: { tipo: "proposta", rotulo: "Proposta" },
  etapa: { tipo: "etapa", rotulo: "Negócio mudou de etapa" },
};

const TIPO_INTERACAO: Record<string, { tipo: TipoEvento; rotulo: string } | null> = {
  card_opened: null,
  ai_suggestion: null,
  status_change: { tipo: "etapa", rotulo: "Mudou de etapa no funil" },
  routing: { tipo: "sistema", rotulo: "Responsável alterado" },
  enrichment: { tipo: "sistema", rotulo: "Enriquecido" },
  bant: { tipo: "sistema", rotulo: "Qualificação (BANT)" },
  cadence: { tipo: "sistema", rotulo: "Cadência" },
  touch: { tipo: "contato", rotulo: "Toque" },
  meeting_invite: { tipo: "reuniao", rotulo: "Convite de reunião" },
};

const CANAL_TOQUE: Record<string, string> = {
  whatsapp: "WhatsApp",
  email: "E-mail",
  ligacao: "Ligação",
  call: "Ligação",
  linkedin: "LinkedIn",
};

export const historicoDoLead = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ leadId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as SupabaseClient;

    const { data: lead } = await db
      .from("leads")
      .select(
        "id, name, email, phone, position, company_name, company_id, contact_id, deal_id, stage_id, assigned_to, rd_owner, source, channel, campaign, form_name, converted_at, created_at, oculto_sdr, linkedin_url",
      )
      .eq("id", data.leadId)
      .maybeSingle();
    if (!lead) throw new Error("Lead não encontrado");
    const l = lead as Row;

    // Todos os leads da mesma pessoa.
    const filtros = [`id.eq.${l.id}`];
    if (l.contact_id) filtros.push(`contact_id.eq.${l.contact_id}`);
    const email = s(l.email)?.toLowerCase().trim();
    const { data: irmaos } = await db
      .from("leads")
      .select("id, created_at, source, deal_id, converted_at, form_name, campaign")
      .or(filtros.join(","))
      .limit(50);
    const { data: porEmail } = email
      ? await db
          .from("leads")
          .select("id, created_at, source, deal_id, converted_at, form_name, campaign")
          .ilike("email", email)
          .limit(50)
      : { data: [] };
    const leads = new Map<string, Row>();
    for (const r of [...((irmaos ?? []) as Row[]), ...((porEmail ?? []) as Row[])])
      leads.set(String(r.id), r);
    const leadIds = [...leads.keys()];

    // Negócios: vínculo pelo contato, contato principal e negócio do lead.
    const dealIds = new Set<string>();
    for (const r of leads.values()) if (r.deal_id) dealIds.add(String(r.deal_id));
    if (l.contact_id) {
      const [{ data: vinc }, { data: princ }] = await Promise.all([
        db.from("deal_contacts").select("deal_id").eq("contact_id", String(l.contact_id)),
        db.from("deals").select("id").eq("contact_id", String(l.contact_id)),
      ]);
      for (const v of (vinc ?? []) as Row[]) dealIds.add(String(v.deal_id));
      for (const p of (princ ?? []) as Row[]) dealIds.add(String(p.id));
    }
    const dids = [...dealIds].slice(0, 100);

    const vazio = { data: [] as Row[] };
    const [
      conversoes,
      notas,
      interacoes,
      toques,
      convites,
      negocios,
      atividades,
      propostas,
      mensagens,
      contato,
      empresa,
      etapa,
    ] = await Promise.all([
      db
        .from("lead_conversoes")
        .select("id, nome, origem, canal, ocorrida_em")
        .in("lead_id", leadIds)
        .order("ocorrida_em", { ascending: false })
        .limit(500),
      db
        .from("lead_notes")
        .select("id, content, author_id, created_at")
        .in("lead_id", leadIds)
        .limit(500),
      db
        .from("lead_interactions")
        .select("id, type, content, author_id, created_at")
        .in("lead_id", leadIds)
        .not("type", "in", "(card_opened,ai_suggestion)")
        .limit(500),
      db
        .from("lead_touches")
        .select("id, touch_number, channel, action_type, outcome, notes, author_id, occurred_at")
        .in("lead_id", leadIds)
        .limit(300),
      db
        .from("lead_meeting_invites")
        .select("id, meeting_at, method, created_at, error")
        .in("lead_id", leadIds)
        .limit(50),
      dids.length
        ? db
            .from("deals")
            .select(
              "id, nome, status, amount, created_at, created_at_original, closed_at, lost_reason, owner_user_id, owner_original, pipeline_id, stage_id",
            )
            .in("id", dids)
        : vazio,
      dids.length
        ? db
            .from("deal_activities")
            .select(
              "id, deal_id, tipo, descricao, occurred_at, author_id, rd_autor, de_stage_id, para_stage_id",
            )
            .in("deal_id", dids)
            .order("occurred_at", { ascending: false })
            .limit(500)
        : vazio,
      dids.length
        ? db
            .from("propostas")
            .select("id, deal_id, numero, status, enviada_em, aceita_em, recusada_em, valor_final")
            .in("deal_id", dids)
        : vazio,
      db
        .from("whatsapp_messages")
        .select("sender_type, created_at")
        .in("lead_id", leadIds)
        .order("created_at", { ascending: false })
        .limit(2000),
      l.contact_id
        ? db
            .from("contacts")
            .select("id, nome, cargo, cidade, estado, lifecycle, fonte_original, owner_original")
            .eq("id", String(l.contact_id))
            .maybeSingle()
        : { data: null },
      l.company_id
        ? db.from("companies").select("id, uid, nome").eq("id", String(l.company_id)).maybeSingle()
        : { data: null },
      l.stage_id
        ? db.from("stages").select("name").eq("id", String(l.stage_id)).maybeSingle()
        : { data: null },
    ]);

    const emp = (empresa.data ?? null) as Row | null;
    const { data: fichaCs } = emp
      ? await db.from("cs_clients").select("client_uid").eq("company_id", String(emp.id)).limit(1)
      : { data: [] };

    // Nomes de quem fez e das etapas de negócio.
    const negs = (negocios.data ?? []) as Row[];
    const ativs = (atividades.data ?? []) as Row[];
    const autores = new Set<string>();
    const add = (v: unknown) => v && autores.add(String(v));
    add(l.assigned_to);
    for (const r of [
      ...((notas.data ?? []) as Row[]),
      ...((interacoes.data ?? []) as Row[]),
      ...((toques.data ?? []) as Row[]),
      ...ativs,
    ])
      add(r.author_id);
    for (const n of negs) add(n.owner_user_id);
    const etapasIds = new Set<string>();
    for (const a of ativs) {
      if (a.de_stage_id) etapasIds.add(String(a.de_stage_id));
      if (a.para_stage_id) etapasIds.add(String(a.para_stage_id));
    }
    const [{ data: perfis }, { data: etapas }] = await Promise.all([
      autores.size
        ? db
            .from("profiles")
            .select("id, full_name, email")
            .in("id", [...autores])
        : vazio,
      etapasIds.size
        ? db
            .from("pipeline_stages")
            .select("id, name")
            .in("id", [...etapasIds])
        : vazio,
    ]);
    const nome = new Map(
      ((perfis ?? []) as Row[]).map((p) => [String(p.id), s(p.full_name) ?? s(p.email)]),
    );
    const quem = (id: unknown) => (id ? (nome.get(String(id)) ?? null) : null);
    const nomeEtapa = new Map(((etapas ?? []) as Row[]).map((e) => [String(e.id), s(e.name)]));
    const nomeNegocio = new Map(negs.map((n) => [String(n.id), s(n.nome) ?? "Negócio"]));

    const eventos: EventoHistorico[] = [];
    const push = (e: EventoHistorico) => {
      if (e.quando) eventos.push(e);
    };

    // Entrada de cada lead da pessoa.
    for (const r of leads.values()) {
      const origem = [s(r.source), s(r.form_name) ?? s(r.campaign)].filter(Boolean).join(" · ");
      push({
        id: `lead-${r.id}`,
        tipo: "sistema",
        titulo: "Entrou na base",
        detalhe: origem || null,
        quando: String(r.created_at),
        autor: null,
        dealId: null,
      });
    }
    for (const c of (conversoes.data ?? []) as Row[]) {
      const oportunidade = c.canal === "oportunidade";
      push({
        id: `conv-${c.id}`,
        tipo: oportunidade ? "negocio" : "conversao",
        titulo: oportunidade ? "Marcado como oportunidade" : "Converteu no evento",
        detalhe: oportunidade
          ? null
          : [s(c.nome), s(c.canal) ? `Canal: ${c.canal}` : null].filter(Boolean).join(" · ") ||
            null,
        quando: String(c.ocorrida_em),
        autor: null,
        dealId: null,
      });
    }
    // Conversão registrada só no lead (formulário/campanha) e não na tabela de conversões.
    if (!(conversoes.data ?? []).length) {
      for (const r of leads.values()) {
        if (!r.converted_at) continue;
        push({
          id: `convlead-${r.id}`,
          tipo: "conversao",
          titulo: "Converteu no evento",
          detalhe: s(r.form_name) ?? s(r.campaign),
          quando: String(r.converted_at),
          autor: null,
          dealId: null,
        });
      }
    }
    for (const n of (notas.data ?? []) as Row[]) {
      push({
        id: `nota-${n.id}`,
        tipo: "anotacao",
        titulo: "Anotação",
        detalhe: s(n.content),
        quando: String(n.created_at),
        autor: quem(n.author_id),
        dealId: null,
      });
    }
    for (const i of (interacoes.data ?? []) as Row[]) {
      const t = TIPO_INTERACAO[String(i.type)];
      if (t === null) continue;
      push({
        id: `int-${i.id}`,
        tipo: t?.tipo ?? "sistema",
        titulo: t?.rotulo ?? String(i.type),
        detalhe: s(i.content),
        quando: String(i.created_at),
        autor: quem(i.author_id),
        dealId: null,
      });
    }
    for (const t of (toques.data ?? []) as Row[]) {
      const canal = CANAL_TOQUE[String(t.channel)] ?? s(t.channel) ?? "";
      push({
        id: `toque-${t.id}`,
        tipo: String(t.channel) === "whatsapp" ? "whatsapp" : "contato",
        titulo: `Toque ${t.touch_number ?? ""} ${canal ? `· ${canal}` : ""}`.trim(),
        detalhe: [s(t.outcome), s(t.notes)].filter(Boolean).join(" — ") || null,
        quando: String(t.occurred_at),
        autor: quem(t.author_id),
        dealId: null,
      });
    }
    for (const m of (convites.data ?? []) as Row[]) {
      push({
        id: `conv-reuniao-${m.id}`,
        tipo: "reuniao",
        titulo: "Reunião agendada",
        detalhe: m.meeting_at
          ? `Para ${new Date(String(m.meeting_at)).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`
          : null,
        quando: String(m.created_at),
        autor: null,
        dealId: null,
      });
    }
    for (const n of negs) {
      const did = String(n.id);
      const valor =
        n.amount != null
          ? Number(n.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
          : null;
      push({
        id: `neg-${did}`,
        tipo: "negocio",
        titulo: "Negociação criada",
        detalhe: [s(n.nome), valor].filter(Boolean).join(" · "),
        quando: String(n.created_at_original ?? n.created_at),
        autor: quem(n.owner_user_id) ?? s(n.owner_original),
        dealId: did,
      });
      if (n.closed_at && (n.status === "won" || n.status === "lost")) {
        push({
          id: `negfim-${did}`,
          tipo: "negocio",
          titulo: n.status === "won" ? "Venda ganha" : "Negociação perdida",
          detalhe:
            [s(n.nome), n.status === "lost" ? s(n.lost_reason) : valor]
              .filter(Boolean)
              .join(" · ") || null,
          quando: String(n.closed_at),
          autor: quem(n.owner_user_id) ?? s(n.owner_original),
          dealId: did,
        });
      }
    }
    for (const a of ativs) {
      const t = TIPO_ATIVIDADE[String(a.tipo)] ?? { tipo: "tarefa", rotulo: "Tarefa" };
      const etapaTxt =
        a.tipo === "etapa"
          ? [nomeEtapa.get(String(a.de_stage_id)), nomeEtapa.get(String(a.para_stage_id))]
              .filter(Boolean)
              .join(" → ")
          : null;
      push({
        id: `ativ-${a.id}`,
        tipo: t.tipo,
        titulo: `${t.rotulo} · ${nomeNegocio.get(String(a.deal_id)) ?? "negócio"}`,
        detalhe: etapaTxt || s(a.descricao),
        quando: String(a.occurred_at),
        autor: quem(a.author_id) ?? s(a.rd_autor),
        dealId: String(a.deal_id),
      });
    }
    for (const p of (propostas.data ?? []) as Row[]) {
      const base = `Proposta ${p.numero ?? ""}`.trim();
      if (p.enviada_em)
        push({
          id: `prop-env-${p.id}`,
          tipo: "proposta",
          titulo: `${base} enviada`,
          detalhe: nomeNegocio.get(String(p.deal_id)) ?? null,
          quando: String(p.enviada_em),
          autor: null,
          dealId: String(p.deal_id),
        });
      if (p.aceita_em)
        push({
          id: `prop-ac-${p.id}`,
          tipo: "proposta",
          titulo: `${base} aceita`,
          detalhe: nomeNegocio.get(String(p.deal_id)) ?? null,
          quando: String(p.aceita_em),
          autor: null,
          dealId: String(p.deal_id),
        });
      if (p.recusada_em)
        push({
          id: `prop-rec-${p.id}`,
          tipo: "proposta",
          titulo: `${base} recusada`,
          detalhe: nomeNegocio.get(String(p.deal_id)) ?? null,
          quando: String(p.recusada_em),
          autor: null,
          dealId: String(p.deal_id),
        });
    }
    // WhatsApp: um evento por dia de conversa, com quantas mensagens foram e vieram.
    const porDia = new Map<string, { enviadas: number; recebidas: number; ultima: string }>();
    for (const m of (mensagens.data ?? []) as Row[]) {
      const quando = String(m.created_at);
      const dia = new Date(quando).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
      const d = porDia.get(dia) ?? { enviadas: 0, recebidas: 0, ultima: quando };
      if (m.sender_type === "contact" || m.sender_type === "lead") d.recebidas++;
      else d.enviadas++;
      if (quando > d.ultima) d.ultima = quando;
      porDia.set(dia, d);
    }
    for (const [dia, d] of porDia) {
      push({
        id: `wa-${dia}`,
        tipo: "whatsapp",
        titulo: "Conversa no WhatsApp",
        detalhe: `${d.enviadas} enviada(s) · ${d.recebidas} recebida(s)`,
        quando: d.ultima,
        autor: null,
        dealId: null,
      });
    }

    eventos.sort((a, b) => (a.quando < b.quando ? 1 : a.quando > b.quando ? -1 : 0));

    const ct = (contato.data ?? null) as Row | null;
    return {
      perfil: {
        nome: s(l.name),
        email: s(l.email),
        telefone: s(l.phone),
        cargo: s(l.position) ?? s(ct?.cargo),
        linkedin: s(l.linkedin_url),
        cidade: [s(ct?.cidade), s(ct?.estado)].filter(Boolean).join(" / ") || null,
        empresa: emp
          ? {
              nome: s(emp.nome),
              uid: s(emp.uid),
              fichaCs: s(((fichaCs ?? []) as Row[])[0]?.client_uid),
            }
          : l.company_name
            ? { nome: s(l.company_name), uid: null, fichaCs: null }
            : null,
        estagio: l.oculto_sdr
          ? "Fora do kanban"
          : (s((etapa.data as Row | null)?.name) ?? "Sem etapa"),
        cicloDeVida: s(ct?.lifecycle),
        dono: quem(l.assigned_to) ?? s(l.rd_owner) ?? s(ct?.owner_original),
        origem: s(l.source) ?? s(ct?.fonte_original),
        entrouEm: String(l.created_at),
        cadastros: leads.size,
      },
      negocios: negs.map((n) => ({
        id: String(n.id),
        nome: s(n.nome) ?? "Negócio",
        status: s(n.status),
        valor: n.amount == null ? null : Number(n.amount),
      })),
      eventos: eventos.slice(0, 1000),
    };
  });
