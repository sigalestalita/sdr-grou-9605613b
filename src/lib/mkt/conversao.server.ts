/*
 * Grava a conversão vinda do site. Só servidor (service role), chamado pela
 * rota pública /api/public/mkt/conversao depois de CORS, honeypot, limite por
 * IP e validação do corpo.
 */
import {
  JANELA_IDEMPOTENCIA_MIN,
  chaveDeIdempotencia,
  decidirAcao,
  descreverAcao,
  normalizarTelefone,
  type Acao,
  type CardExistente,
  type CorpoDaConversao,
  type RegraPassagem,
} from "./conversao";

type Ativo = {
  id: string;
  nome: string;
  slug: string;
  etapa_funil: string;
  regra_passagem: RegraPassagem;
  sem_ia_automatica: boolean;
  ativo: boolean;
};

type Contexto = { ip: string | null; userAgent: string | null };

export type ResultadoConversao =
  | { status: 401; corpo: { ok: false; erro: string } }
  | { status: 200; corpo: Record<string, unknown> };

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Os tipos gerados conhecem as tabelas novas, mas as consultas aqui montam
  // patches dinâmicos; o cliente sem tipos evita casts em cada linha.
  return supabaseAdmin as unknown as import("@supabase/supabase-js").SupabaseClient;
}

export async function dentroDoLimite(ip: string, max: number, janelaMin: number) {
  const db = await admin();
  const { data, error } = await db.rpc("mkt_registrar_tentativa", {
    _ip: ip,
    _max: max,
    _janela_min: janelaMin,
  });
  // Falha do contador não pode derrubar a captação.
  if (error) return true;
  return data !== false;
}

async function log(status: string, detail: Record<string, unknown>) {
  try {
    const db = await admin();
    await db.from("integration_logs").insert({
      provider: "site",
      action: "mkt_conversao",
      status,
      detail,
    });
  } catch {
    /* log é melhor-esforço */
  }
}

async function buscarCard(db: Awaited<ReturnType<typeof admin>>, email: string) {
  const { data } = await db
    .from("leads")
    .select("id, oculto_sdr, stage_id, form_payload, phone, company_name, assigned_to, stages:stage_id(slug, is_terminal)")
    .ilike("email", email.replace(/[\\%_]/g, (c) => `\\${c}`))
    .limit(1)
    .maybeSingle();
  if (!data) return { card: null as CardExistente, linha: null };
  const r = data as unknown as Record<string, unknown> & {
    stages: { slug: string | null; is_terminal: boolean | null } | null;
  };
  return {
    card: {
      id: String(r.id),
      oculto: r.oculto_sdr === true,
      etapaSlug: r.stages?.slug ?? null,
      etapaTerminal: r.stages?.is_terminal === true,
    } as CardExistente,
    linha: r,
  };
}

async function conversaoRecente(
  db: Awaited<ReturnType<typeof admin>>,
  ativoId: string,
  email: string,
) {
  const desde = new Date(Date.now() - JANELA_IDEMPOTENCIA_MIN * 60_000).toISOString();
  const { data } = await db
    .from("mkt_conversoes")
    .select("id, created_at")
    .eq("ativo_id", ativoId)
    .eq("email", email)
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { id: string; created_at: string } | null) ?? null;
}

const vazio = (v: unknown) => v === null || v === undefined || String(v).trim() === "";

/** Preenche só o que está vazio no contato ligado ao card (ou acha/cria pelo e-mail). */
async function completarContato(
  db: Awaited<ReturnType<typeof admin>>,
  contactId: string | null,
  corpo: CorpoDaConversao,
  telefone: string | null,
  ativo: Ativo,
): Promise<string | null> {
  let id = contactId;
  if (!id) {
    const { data: achado } = await db
      .from("contacts")
      .select("id")
      .ilike("email", corpo.email.replace(/[\\%_]/g, (c) => `\\${c}`))
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    id = (achado as { id: string } | null)?.id ?? null;
  }
  if (!id) {
    const { data: novo } = await db
      .from("contacts")
      .insert({
        nome: corpo.nome,
        email: corpo.email,
        telefone,
        provenance: { origem: "mkt_site", ativo_id: ativo.id, ativo: ativo.slug },
      })
      .select("id")
      .single();
    return (novo as { id: string } | null)?.id ?? null;
  }
  const { data: atual } = await db
    .from("contacts")
    .select("nome, telefone")
    .eq("id", id)
    .maybeSingle();
  const a = (atual ?? {}) as { nome?: string | null; telefone?: string | null };
  const patch: Record<string, unknown> = {};
  if ((vazio(a.nome) || a.nome === "Sem nome" || a.nome === corpo.email) && corpo.nome)
    patch.nome = corpo.nome;
  if (vazio(a.telefone) && telefone) patch.telefone = telefone;
  if (Object.keys(patch).length) await db.from("contacts").update(patch).eq("id", id);
  return id;
}

export async function registrarConversaoDoSite(
  corpo: CorpoDaConversao,
  ctx: Contexto,
): Promise<ResultadoConversao> {
  const db = await admin();
  const { data: ativoRow } = await db
    .from("mkt_ativos")
    .select("id, nome, slug, etapa_funil, regra_passagem, sem_ia_automatica, ativo")
    .eq("chave", corpo.chave)
    .maybeSingle();
  const ativo = ativoRow as Ativo | null;
  if (!ativo || !ativo.ativo) {
    return { status: 401, corpo: { ok: false, erro: "Chave do ativo inválida ou ativo desligado." } };
  }

  const telefone = normalizarTelefone(corpo.telefone);
  const [recente, { card, linha }] = await Promise.all([
    conversaoRecente(db, ativo.id, corpo.email),
    buscarCard(db, corpo.email),
  ]);
  const acao = decidirAcao(ativo.regra_passagem, card);
  const ativoPublico = {
    nome: ativo.nome,
    slug: ativo.slug,
    etapa_funil: ativo.etapa_funil,
    regra_passagem: ativo.regra_passagem,
    sem_ia_automatica: ativo.sem_ia_automatica,
  };

  if (corpo.teste) {
    return {
      status: 200,
      corpo: {
        ok: true,
        teste: true,
        gravou: false,
        ativo: ativoPublico,
        duplicada: !!recente,
        acao: recente ? "nada (duplicada)" : acao,
        explicacao: recente
          ? `Já houve envio deste e-mail neste ativo nos últimos ${JANELA_IDEMPOTENCIA_MIN} minutos: não gravaria de novo.`
          : descreverAcao(acao),
        card_existente: card
          ? { etapa: card.etapaSlug, escondido_do_kanban: card.oculto }
          : null,
        lead: {
          nome: corpo.nome,
          email: corpo.email,
          telefone,
          empresa: corpo.empresa,
          origem: ativo.nome,
          etapa: acao === "criar_card" || acao === "reativar_card" ? "novo" : card?.etapaSlug ?? null,
          sem_ia_automatica: ativo.sem_ia_automatica,
          respostas: corpo.respostas,
          aceita_contato: corpo.aceita_contato,
          pagina_url: corpo.pagina_url,
        },
      },
    };
  }

  if (recente) {
    return { status: 200, corpo: { ok: true, duplicada: true } };
  }

  const agora = new Date();
  const agoraIso = agora.toISOString();
  const { data: conv, error: errConv } = await db
    .from("mkt_conversoes")
    .insert({
      ativo_id: ativo.id,
      email: corpo.email,
      nome: corpo.nome,
      telefone,
      empresa: corpo.empresa,
      pagina_url: corpo.pagina_url,
      utm_source: corpo.utm_source,
      utm_medium: corpo.utm_medium,
      utm_campaign: corpo.utm_campaign,
      aceita_contato: corpo.aceita_contato,
      respostas: corpo.respostas,
      origem_tecnica: "site",
      ip: ctx.ip,
      user_agent: ctx.userAgent?.slice(0, 500) ?? null,
      idempotencia: chaveDeIdempotencia(ativo.id, corpo.email, agora),
    })
    .select("id")
    .single();
  if (errConv) {
    // Corrida com outro envio igual: a chave de idempotência já existe.
    if ((errConv as { code?: string }).code === "23505") {
      return { status: 200, corpo: { ok: true, duplicada: true } };
    }
    await log("erro", { etapa: "conversao", ativo: ativo.slug, erro: errConv.message });
    throw new Error("Não foi possível registrar a conversão.");
  }
  const conversaoId = (conv as { id: string }).id;

  const doEnvio = {
    conversao_id: conversaoId,
    ativo_id: ativo.id,
    ativo: ativo.nome,
    em: agoraIso,
    respostas: corpo.respostas,
    aceita_contato: corpo.aceita_contato,
    pagina_url: corpo.pagina_url,
    utm_source: corpo.utm_source,
    utm_medium: corpo.utm_medium,
    utm_campaign: corpo.utm_campaign,
  };

  let leadId: string | null = null;
  let acaoFeita: Acao = acao;
  let precisaRotear = false;
  try {
    if (acao === "criar_card") {
      const { data: novo } = await db.from("stages").select("id").eq("slug", "novo").maybeSingle();
      const { data: ins, error: errIns } = await db
        .from("leads")
        .insert({
          name: corpo.nome,
          email: corpo.email,
          phone: telefone,
          company_name: corpo.empresa,
          original_company_name: corpo.empresa,
          source: ativo.nome,
          channel: "site",
          form_name: ativo.nome,
          campaign: corpo.utm_campaign,
          stage_id: (novo as { id: string } | null)?.id ?? null,
          enrichment_status: "pending",
          converted_at: agoraIso,
          last_action_at: agoraIso,
          stage_entered_at: agoraIso,
          sem_ia_automatica: ativo.sem_ia_automatica,
          mkt_ativo_id: ativo.id,
          form_payload: { origem: "site", ...doEnvio },
        })
        .select("id")
        .single();
      if (errIns && (errIns as { code?: string }).code === "23505") {
        // Outro caminho criou o card com este e-mail agora há pouco.
        const again = await buscarCard(db, corpo.email);
        if (again.card) {
          leadId = again.card.id;
          acaoFeita = "registrar_no_card_existente";
          await registrarNoCard(db, again.linha!, doEnvio, corpo, telefone, agoraIso, false, ativo);
        }
      } else if (errIns) {
        throw new Error(errIns.message);
      } else {
        leadId = (ins as { id: string }).id;
        precisaRotear = true;
      }
    } else if (acao === "registrar_no_card_existente" || acao === "reativar_card") {
      leadId = card!.id;
      await registrarNoCard(db, linha!, doEnvio, corpo, telefone, agoraIso, acao === "reativar_card", ativo);
      precisaRotear = acao === "reativar_card" && vazio(linha?.assigned_to);
    }

    if (leadId) {
      // Aparece no histórico do card como "Converteu no evento".
      await db.from("lead_conversoes").upsert(
        {
          lead_id: leadId,
          nome: ativo.nome,
          origem: "site",
          canal: "formulario",
          ocorrida_em: agoraIso,
          payload: doEnvio,
        },
        { onConflict: "lead_id,nome,ocorrida_em", ignoreDuplicates: true },
      );
    }

    if (leadId && precisaRotear) {
      try {
        const { ensureLeadRouted } = await import("@/lib/lead-routing.server");
        await ensureLeadRouted({ supabase: db, leadId, mesmoSemTipo: true });
      } catch {
        /* distribuir é melhor-esforço: o card já está no kanban */
      }
    }

    let contactId: string | null = null;
    if (leadId) {
      const { data: l } = await db.from("leads").select("contact_id").eq("id", leadId).maybeSingle();
      contactId = (l as { contact_id: string | null } | null)?.contact_id ?? null;
    }
    contactId = await completarContato(db, contactId, corpo, telefone, ativo);

    await db
      .from("mkt_conversoes")
      .update({ lead_id: leadId, contact_id: contactId, acao: acaoFeita })
      .eq("id", conversaoId);
  } catch (e) {
    // A conversão já está gravada: o lead não se perde, só fica para revisar.
    await log("erro", {
      etapa: "card",
      ativo: ativo.slug,
      conversao_id: conversaoId,
      erro: e instanceof Error ? e.message : String(e),
    });
    await db.from("mkt_conversoes").update({ acao: `erro:${acao}` }).eq("id", conversaoId);
    return { status: 200, corpo: { ok: true, conversao_id: conversaoId } };
  }

  await log("ok", { ativo: ativo.slug, conversao_id: conversaoId, acao: acaoFeita });
  return { status: 200, corpo: { ok: true, conversao_id: conversaoId } };
}

/**
 * Card já existe com este e-mail: guarda o envio no card, preenche só o que
 * está vazio e, se ele estava escondido do kanban, traz de volta para Novo lead.
 */
async function registrarNoCard(
  db: Awaited<ReturnType<typeof admin>>,
  linha: Record<string, unknown>,
  doEnvio: Record<string, unknown>,
  corpo: CorpoDaConversao,
  telefone: string | null,
  agoraIso: string,
  reativar: boolean,
  ativo: Ativo,
) {
  const anterior = (linha.form_payload ?? {}) as Record<string, unknown>;
  const historico = Array.isArray(anterior.reconversoes) ? anterior.reconversoes : [];
  const patch: Record<string, unknown> = {
    last_action_at: agoraIso,
    form_payload: {
      ...anterior,
      reconversoes: [...historico, { origem: ativo.nome, ...doEnvio }],
    },
  };
  if (vazio(linha.phone) && telefone) patch.phone = telefone;
  if (vazio(linha.company_name) && corpo.empresa) patch.company_name = corpo.empresa;
  if (reativar) {
    const { data: novo } = await db.from("stages").select("id").eq("slug", "novo").maybeSingle();
    patch.oculto_sdr = false;
    patch.stage_id = (novo as { id: string } | null)?.id ?? null;
    patch.stage_entered_at = agoraIso;
    patch.source = ativo.nome;
    patch.mkt_ativo_id = ativo.id;
    // Volta ao kanban sem disparar a abertura da IA nem FUP de "entrou em Novo".
    if (ativo.sem_ia_automatica) patch.sem_ia_automatica = true;
  }
  const { error } = await db.from("leads").update(patch).eq("id", String(linha.id));
  if (error) throw new Error(error.message);
}
