import type { SupabaseClient } from "@supabase/supabase-js";
import type { DadosDaConta } from "./resumo-por-time";

/*
 * Lê do banco tudo o que os cinco times fizeram com uma empresa e devolve no
 * formato das regras (resumo-por-time.ts). Lê com a chave do servidor: o
 * resumo é visível para qualquer pessoa logada (decisão da gestão), inclusive
 * valores financeiros.
 */
type Linha = Record<string, unknown>;
const s = (v: unknown) => (v == null ? null : String(v));
const n = (v: unknown) => (v == null ? null : Number(v));

export async function lerDadosDaConta(
  db: SupabaseClient,
  companyId: string,
): Promise<{
  empresa: string;
  dados: DadosDaConta;
}> {
  const [
    empresa,
    perfis,
    fichas,
    leads,
    negocios,
    propostas,
    reunioesAn,
    cadastrais,
    faturas,
    reqs,
    inscricoes,
    etapas,
  ] = await Promise.all([
    db.from("companies").select("nome").eq("id", companyId).maybeSingle(),
    db.from("profiles").select("id, full_name, email"),
    db
      .from("cs_clients")
      .select(
        "client_uid, cs_responsavel_id, current_signal, health_score, data_renovacao, ativo, last_contact_at",
      )
      .eq("company_id", companyId)
      .is("mesclado_em", null),
    db
      .from("leads")
      .select("id, name, assigned_to, created_at, meeting_at, next_follow_up_at, stage_id")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(100),
    db
      .from("deals")
      .select(
        "id, nome, status, amount, executivo_user_id, owner_user_id, created_at, closed_at, stage_id",
      )
      .eq("company_id", companyId)
      .eq("exemplo", false)
      .order("created_at", { ascending: false })
      .limit(200),
    db
      .from("propostas")
      .select(
        "id, numero, status, valor_final, enviada_em, aceita_em, recusada_em, created_at, enviada_por, created_by",
      )
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(100),
    db
      .from("reunioes_analisadas")
      .select("id, titulo, realizada_em, conduzida_por, conduzida_por_nome, tipo, proximo_passo")
      .eq("company_id", companyId)
      .order("realizada_em", { ascending: false })
      .limit(100),
    db
      .from("fichas_cadastrais")
      .select("id, origem, enviada_em, confirmada_em, confirmada_por")
      .eq("company_id", companyId),
    db
      .from("faturas")
      .select("id, numero_nf, emitida_em, valor_liquido, status, created_by")
      .eq("company_id", companyId)
      .order("emitida_em", { ascending: false, nullsFirst: false })
      .limit(100),
    db
      .from("requerimentos")
      .select("id, numero, servico, status, created_at, criado_por")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(100),
    db
      .from("turma_inscricoes")
      .select(
        "id, participante_nome, status, checkin_em, created_at, turmas:turma_id(nome, trainer_id)",
      )
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(200),
    db.from("pipeline_stages").select("id, nome"),
  ]);

  const nome = new Map(
    ((perfis.data ?? []) as Linha[]).map((p) => [
      String(p.id),
      s(p.full_name) || s(p.email) || "—",
    ]),
  );
  const pessoa = (id: unknown) => (id ? (nome.get(String(id)) ?? null) : null);
  const etapa = new Map(((etapas.data ?? []) as Linha[]).map((e) => [String(e.id), s(e.nome)]));

  const fichasRows = (fichas.data ?? []) as Linha[];
  const uids = fichasRows.map((f) => String(f.client_uid));
  const leadIds = ((leads.data ?? []) as Linha[]).map((l) => String(l.id));
  const dealIds = ((negocios.data ?? []) as Linha[]).map((d) => String(d.id));
  const faturaIds = ((faturas.data ?? []) as Linha[]).map((f) => String(f.id));
  const reqIds = ((reqs.data ?? []) as Linha[]).map((r) => String(r.id));
  const vazio = { data: [] as Linha[] };

  const [
    toques,
    atividades,
    reunioesCs,
    tarefas,
    tickets,
    oportunidades,
    registros,
    parcelas,
    sessoes,
  ] = await Promise.all([
    leadIds.length
      ? db
          .from("lead_touches")
          .select("lead_id, occurred_at, channel, outcome, author_id")
          .in("lead_id", leadIds)
          .order("occurred_at", { ascending: false })
          .limit(300)
      : vazio,
    dealIds.length
      ? db
          .from("deal_activities")
          .select("deal_id, occurred_at, tipo, descricao, author_id, rd_autor")
          .in("deal_id", dealIds)
          .neq("tipo", "etapa")
          .order("occurred_at", { ascending: false })
          .limit(300)
      : vazio,
    uids.length
      ? db
          .from("cs_meetings")
          .select("id, client_uid, title, occurred_at, status, owner_user_id, next_step")
          .in("client_uid", uids)
          .order("occurred_at", { ascending: false })
          .limit(200)
      : vazio,
    uids.length
      ? db
          .from("cs_tasks")
          .select("id, title, status, due_at, done_at, owner_id, done_by")
          .in("client_uid", uids)
          .order("due_at", { ascending: false })
          .limit(300)
      : vazio,
    uids.length
      ? db
          .from("cs_tickets")
          .select("id, numero, titulo, status, created_at, resolvido_em, responsavel_id")
          .in("client_uid", uids)
          .order("created_at", { ascending: false })
          .limit(100)
      : vazio,
    uids.length
      ? db
          .from("cs_oportunidades")
          .select("id, tipo, status, valor_estimado, created_at, sinalizada_por")
          .in("client_uid", uids)
          .limit(100)
      : vazio,
    uids.length
      ? db
          .from("cs_timeline_events")
          .select("event_type, channel, title, description, author_id, occurred_at")
          .in("client_uid", uids)
          .neq("event_type", "card_criado")
          .order("occurred_at", { ascending: false })
          .limit(1000)
      : vazio,
    faturaIds.length
      ? db
          .from("fatura_parcelas")
          .select("fatura_id, vencimento, valor, pago_em")
          .in("fatura_id", faturaIds)
      : vazio,
    reqIds.length
      ? db
          .from("requerimento_sessoes")
          .select("id, requerimento_id, titulo, data, status, trainer_id")
          .in("requerimento_id", reqIds)
      : vazio,
  ]);

  /*
   * WhatsApp do CS chega mensagem por mensagem na linha do tempo do CS. Para a
   * linha do tempo da conta não virar a conversa inteira, junta por dia.
   */
  const registrosCs: DadosDaConta["registrosCs"] = [];
  const zapPorDia = new Map<
    string,
    { quando: string; enviadas: number; recebidas: number; quem: Set<string> }
  >();
  for (const r of (registros.data ?? []) as Linha[]) {
    const tipo = String(r.event_type ?? "");
    const quando = String(r.occurred_at ?? "");
    if (tipo.startsWith("whatsapp")) {
      const dia = quando.slice(0, 10);
      const z = zapPorDia.get(dia) ?? {
        quando,
        enviadas: 0,
        recebidas: 0,
        quem: new Set<string>(),
      };
      if (tipo === "whatsapp_recebido") z.recebidas++;
      else z.enviadas++;
      const q = pessoa(r.author_id);
      if (q) z.quem.add(q);
      zapPorDia.set(dia, z);
      continue;
    }
    registrosCs.push({
      quando,
      titulo: s(r.title) ?? tipo.replace(/_/g, " "),
      detalhe: s(r.description)?.slice(0, 160) ?? null,
      quem: pessoa(r.author_id),
    });
  }
  for (const z of zapPorDia.values())
    registrosCs.push({
      quando: z.quando,
      titulo: "Conversa no WhatsApp",
      detalhe: `${z.enviadas} enviada${z.enviadas === 1 ? "" : "s"}, ${z.recebidas} recebida${z.recebidas === 1 ? "" : "s"}`,
      quem: [...z.quem].join(", ") || null,
    });

  const dados: DadosDaConta = {
    agora: Date.now(),
    leads: ((leads.data ?? []) as Linha[]).map((l) => ({
      id: String(l.id),
      nome: s(l.name),
      sdr: pessoa(l.assigned_to),
      criadoEm: String(l.created_at),
      reuniaoEm: s(l.meeting_at),
      followUpEm: s(l.next_follow_up_at),
      etapa: l.stage_id ? (etapa.get(String(l.stage_id)) ?? null) : null,
    })),
    toques: ((toques.data ?? []) as Linha[]).map((t) => ({
      leadId: String(t.lead_id),
      quando: String(t.occurred_at),
      canal: s(t.channel),
      resultado: s(t.outcome),
      quem: pessoa(t.author_id),
    })),
    negocios: ((negocios.data ?? []) as Linha[]).map((d) => ({
      id: String(d.id),
      nome: s(d.nome),
      status: String(d.status),
      valor: n(d.amount),
      responsavel: pessoa(d.executivo_user_id ?? d.owner_user_id),
      criadoEm: String(d.created_at),
      fechadoEm: s(d.closed_at),
      etapa: d.stage_id ? (etapa.get(String(d.stage_id)) ?? null) : null,
    })),
    atividadesNegocio: ((atividades.data ?? []) as Linha[]).map((a) => ({
      dealId: String(a.deal_id),
      quando: String(a.occurred_at),
      tipo: s(a.tipo),
      descricao: s(a.descricao),
      quem: pessoa(a.author_id) ?? s(a.rd_autor),
    })),
    propostas: ((propostas.data ?? []) as Linha[]).map((p) => ({
      id: String(p.id),
      numero: (p.numero as string | number | null) ?? null,
      status: String(p.status),
      valor: n(p.valor_final),
      enviadaEm: s(p.enviada_em),
      aceitaEm: s(p.aceita_em),
      recusadaEm: s(p.recusada_em),
      criadoEm: String(p.created_at),
      quem: pessoa(p.enviada_por ?? p.created_by),
    })),
    reunioesAnalisadas: ((reunioesAn.data ?? []) as Linha[]).map((r) => ({
      id: String(r.id),
      titulo: s(r.titulo),
      quando: String(r.realizada_em),
      quem: pessoa(r.conduzida_por) ?? s(r.conduzida_por_nome),
      tipo: s(r.tipo),
      proximoPasso: s(r.proximo_passo),
    })),
    fichas: fichasRows.map((f) => ({
      clientUid: String(f.client_uid),
      responsavel: pessoa(f.cs_responsavel_id),
      sinal: s(f.current_signal),
      saude: n(f.health_score),
      renovacao: s(f.data_renovacao),
      ativo: !!f.ativo,
      ultimoContato: s(f.last_contact_at),
    })),
    reunioesCs: ((reunioesCs.data ?? []) as Linha[]).map((r) => ({
      id: String(r.id),
      clientUid: String(r.client_uid),
      titulo: s(r.title),
      quando: String(r.occurred_at),
      status: s(r.status),
      quem: pessoa(r.owner_user_id),
      proximoPasso: s(r.next_step),
    })),
    tarefasCs: ((tarefas.data ?? []) as Linha[]).map((t) => ({
      id: String(t.id),
      titulo: s(t.title),
      status: String(t.status),
      venceEm: s(t.due_at),
      feitaEm: s(t.done_at),
      quem: pessoa(t.done_by ?? t.owner_id),
    })),
    tickets: ((tickets.data ?? []) as Linha[]).map((t) => ({
      id: String(t.id),
      numero: n(t.numero),
      titulo: s(t.titulo),
      status: String(t.status),
      criadoEm: String(t.created_at),
      resolvidoEm: s(t.resolvido_em),
      quem: pessoa(t.responsavel_id),
    })),
    oportunidades: ((oportunidades.data ?? []) as Linha[]).map((o) => ({
      id: String(o.id),
      tipo: s(o.tipo),
      status: s(o.status),
      valor: n(o.valor_estimado),
      criadoEm: String(o.created_at),
      quem: pessoa(o.sinalizada_por),
    })),
    registrosCs,
    fichasCadastrais: ((cadastrais.data ?? []) as Linha[]).map((f) => ({
      id: String(f.id),
      origem: s(f.origem),
      enviadaEm: s(f.enviada_em),
      confirmadaEm: s(f.confirmada_em),
      quem: pessoa(f.confirmada_por),
    })),
    faturas: ((faturas.data ?? []) as Linha[]).map((f) => ({
      id: String(f.id),
      numeroNf: s(f.numero_nf),
      emitidaEm: s(f.emitida_em),
      valorLiquido: n(f.valor_liquido),
      status: String(f.status),
      quem: pessoa(f.created_by),
    })),
    parcelas: ((parcelas.data ?? []) as Linha[]).map((p) => ({
      faturaId: String(p.fatura_id),
      vencimento: String(p.vencimento),
      valor: n(p.valor),
      pagoEm: s(p.pago_em),
    })),
    requerimentos: ((reqs.data ?? []) as Linha[]).map((r) => ({
      id: String(r.id),
      numero: (r.numero as string | number | null) ?? null,
      servico: s(r.servico),
      status: String(r.status),
      criadoEm: String(r.created_at),
      quem: pessoa(r.criado_por),
    })),
    sessoes: ((sessoes.data ?? []) as Linha[]).map((x) => ({
      id: String(x.id),
      requerimentoId: String(x.requerimento_id),
      titulo: s(x.titulo),
      data: s(x.data),
      status: String(x.status),
      trainer: pessoa(x.trainer_id),
    })),
    inscricoes: ((inscricoes.data ?? []) as Linha[]).map((i) => {
      const turma = i.turmas as { nome?: string | null; trainer_id?: string | null } | null;
      return {
        id: String(i.id),
        turma: turma?.nome ?? null,
        participante: s(i.participante_nome),
        status: s(i.status),
        checkinEm: s(i.checkin_em),
        criadoEm: String(i.created_at),
        trainer: pessoa(turma?.trainer_id),
      };
    }),
  };

  return { empresa: s((empresa.data as Linha | null)?.nome) ?? "Empresa", dados };
}
