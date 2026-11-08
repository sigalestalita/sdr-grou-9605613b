import type { SupabaseClient } from "@supabase/supabase-js";

/*
 * Ferramentas do assistente flutuante. Todas consultam com o acesso de quem
 * pergunta (o cliente do Supabase da sessão), então cada pessoa só vê o que já
 * veria nas telas. Exceção declarada: a busca também procura leads fora do
 * kanban (base de marketing do RD), como a busca global do topo.
 */

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null || v === "" ? null : String(v));
const termoSeguro = (q: string) => q.replace(/[%_,()]/g, " ").trim();
const diasAtras = (d: number) => new Date(Date.now() - d * 86400000).toISOString();

export const FERRAMENTAS_CRM = [
  {
    type: "function",
    function: {
      name: "buscar_registros",
      description:
        "Procura por nome/e-mail em leads, empresas e clientes do CS. Use para achar o id antes de detalhar. Retorna links internos.",
      parameters: {
        type: "object",
        properties: { termo: { type: "string" } },
        required: ["termo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_negocios",
      description:
        "Negócios (deals) com filtros. Retorna total, soma de valor, quebra por status/dono/funil/mês e amostra de até 20. Use para vendas, ganhos, pipeline aberto, ticket médio, ranking de vendedores.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["open", "won", "lost"] },
          dias: {
            type: "number",
            description:
              "Janela em dias. Para ganhos/perdidos filtra pela data de fechamento; para abertos, pela criação.",
          },
          desde: { type: "string", description: "Data inicial AAAA-MM-DD (alternativa a dias)" },
          ate: { type: "string", description: "Data final AAAA-MM-DD" },
          funil: { type: "string", description: "Parte do nome do funil" },
          dono: { type: "string", description: "Parte do nome do dono/executivo" },
          empresa: { type: "string", description: "Parte do nome da empresa" },
          agrupar_por: { type: "string", enum: ["dono", "funil", "mes", "status"] },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_carteira_cs",
      description:
        "Clientes da carteira do CS (fichas). Filtros por sinaleira, responsável, renovação próxima, etapa da jornada. Retorna contagem por sinaleira/etapa e amostra.",
      parameters: {
        type: "object",
        properties: {
          sinaleira: {
            type: "string",
            enum: ["verde", "amarelo", "vermelho", "preto", "sem_dado"],
          },
          responsavel: { type: "string", description: "Parte do nome do CS responsável" },
          renova_em_dias: {
            type: "number",
            description: "Só quem renova (data_renovacao) nos próximos N dias",
          },
          etapa: { type: "string", description: "Etapa da jornada (journey_stage)" },
          sem_contato_dias: {
            type: "number",
            description: "Só quem está sem contato há mais de N dias",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "detalhar_empresa",
      description:
        "Detalhe de uma empresa: ficha de CS (sinaleira, saúde, renovação, responsáveis), negócios e contatos. Informe o nome ou o código (uid).",
      parameters: {
        type: "object",
        properties: { nome_ou_uid: { type: "string" } },
        required: ["nome_ou_uid"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "detalhar_lead",
      description:
        "Detalhe de um lead: dados, etapa, dono, conversões, anotações recentes e negócios. Informe o id (uuid) ou nome/e-mail.",
      parameters: {
        type: "object",
        properties: { id_ou_nome: { type: "string" } },
        required: ["id_ou_nome"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_propostas",
      description: "Propostas comerciais: por status e período. Retorna contagem, soma e amostra.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description: "rascunho, enviada, visualizada, aceita, recusada",
          },
          dias: { type: "number" },
        },
      },
    },
  },
];

async function perfis(db: SupabaseClient) {
  const { data } = await db.from("profiles").select("id, full_name, email");
  const porId = new Map<string, string>();
  for (const p of (data ?? []) as Row[])
    porId.set(String(p.id), s(p.full_name) ?? s(p.email) ?? "—");
  return porId;
}

function idsPorNome(porId: Map<string, string>, parte: string) {
  const p = parte.toLowerCase();
  return [...porId.entries()].filter(([, n]) => n.toLowerCase().includes(p)).map(([id]) => id);
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export async function executarFerramentaCrm(
  db: SupabaseClient,
  nome: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (nome === "buscar_registros") {
    const termo = termoSeguro(String(args.termo ?? ""));
    if (termo.length < 2) return { erro: "termo curto demais" };
    const alvo = `%${termo}%`;
    const [leads, empresas, clientes] = await Promise.all([
      db
        .from("leads")
        .select("id, name, company_name, email")
        .or(`name.ilike.${alvo},company_name.ilike.${alvo},email.ilike.${alvo}`)
        .limit(8),
      db.from("companies").select("id, uid, nome").ilike("nome", alvo).limit(8),
      db
        .from("cs_clients")
        .select("client_uid, nome_empresa, current_signal")
        .ilike("nome_empresa", alvo)
        .limit(8),
    ]);
    let ocultos: Row[] = [];
    if ((leads.data ?? []).length < 8) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data } = await supabaseAdmin
        .from("leads")
        .select("id, name, company_name, email")
        .eq("oculto_sdr", true)
        .or(`name.ilike.${alvo},company_name.ilike.${alvo},email.ilike.${alvo}`)
        .limit(8 - (leads.data ?? []).length);
      ocultos = (data ?? []) as Row[];
    }
    return {
      leads: [...((leads.data ?? []) as Row[]), ...ocultos].map((l) => ({
        nome: l.name,
        empresa: l.company_name,
        email: l.email,
        link: `/lead/${l.id}`,
      })),
      empresas: ((empresas.data ?? []) as Row[]).map((e) => ({
        nome: e.nome,
        uid: e.uid,
        link: `/jornada?empresa=${e.id}`,
      })),
      clientes_cs: ((clientes.data ?? []) as Row[]).map((c) => ({
        nome: c.nome_empresa,
        sinaleira: c.current_signal,
        link: `/empresas/${c.client_uid}`,
      })),
    };
  }

  if (nome === "consultar_negocios") {
    const porId = await perfis(db);
    const status = s(args.status);
    let q = db
      .from("deals")
      .select(
        "id, nome, status, amount, created_at, created_at_original, closed_at, owner_user_id, owner_original, pipeline_id, company_id",
      )
      .limit(10000);
    if (status) q = q.eq("status", status);
    const campoData = status === "won" || status === "lost" ? "closed_at" : "created_at";
    const desde = s(args.desde) ?? (args.dias ? diasAtras(Number(args.dias)) : null);
    if (desde) q = q.gte(campoData, desde);
    if (args.ate) q = q.lte(campoData, `${String(args.ate)}T23:59:59`);
    if (args.dono) {
      const ids = idsPorNome(porId, String(args.dono));
      if (!ids.length) return { erro: `Ninguém com o nome "${args.dono}"` };
      q = q.in("owner_user_id", ids);
    }
    const { data: funis } = await db.from("pipelines").select("id, nome");
    const nomeFunil = new Map(((funis ?? []) as Row[]).map((f) => [String(f.id), String(f.nome)]));
    if (args.funil) {
      const ids = [...nomeFunil.entries()]
        .filter(([, n]) => n.toLowerCase().includes(String(args.funil).toLowerCase()))
        .map(([id]) => id);
      if (!ids.length) return { erro: `Nenhum funil com "${args.funil}"` };
      q = q.in("pipeline_id", ids);
    }
    if (args.empresa) {
      const { data: emps } = await db
        .from("companies")
        .select("id")
        .ilike("nome", `%${termoSeguro(String(args.empresa))}%`)
        .limit(50);
      const ids = ((emps ?? []) as Row[]).map((e) => String(e.id));
      if (!ids.length) return { erro: `Nenhuma empresa com "${args.empresa}"` };
      q = q.in("company_id", ids);
    }
    const { data, error } = await q;
    if (error) return { erro: error.message };
    const lista = (data ?? []) as Row[];
    const total = lista.reduce((t, d) => t + (Number(d.amount) || 0), 0);
    const grupo = s(args.agrupar_por);
    let quebra: Array<{ chave: string; qtd: number; valor: string }> | undefined;
    if (grupo) {
      const m = new Map<string, { qtd: number; valor: number }>();
      for (const d of lista) {
        const chave =
          grupo === "dono"
            ? (porId.get(String(d.owner_user_id)) ?? s(d.owner_original) ?? "sem dono")
            : grupo === "funil"
              ? (nomeFunil.get(String(d.pipeline_id)) ?? "sem funil")
              : grupo === "mes"
                ? String(d[campoData] ?? d.created_at ?? "").slice(0, 7) || "sem data"
                : String(d.status);
        const g = m.get(chave) ?? { qtd: 0, valor: 0 };
        g.qtd++;
        g.valor += Number(d.amount) || 0;
        m.set(chave, g);
      }
      quebra = [...m.entries()]
        .sort((a, b) => (grupo === "mes" ? b[0].localeCompare(a[0]) : b[1].valor - a[1].valor))
        .slice(0, 30)
        .map(([chave, g]) => ({ chave, qtd: g.qtd, valor: brl(g.valor) }));
    }
    return {
      filtro_de_data: desde ? `${campoData} desde ${desde.slice(0, 10)}` : "sem filtro de data",
      quantidade: lista.length,
      valor_total: brl(total),
      ticket_medio: lista.length ? brl(total / lista.length) : null,
      quebra,
      amostra: lista
        .sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0))
        .slice(0, 20)
        .map((d) => ({
          nome: d.nome,
          status: d.status,
          valor: d.amount == null ? null : brl(Number(d.amount)),
          dono: porId.get(String(d.owner_user_id)) ?? s(d.owner_original),
          funil: nomeFunil.get(String(d.pipeline_id)) ?? null,
          fechado_em: s(d.closed_at)?.slice(0, 10) ?? null,
          link: `/negocio/${d.id}`,
        })),
    };
  }

  if (nome === "consultar_carteira_cs") {
    const porId = await perfis(db);
    let q = db
      .from("cs_clients")
      .select(
        "client_uid, nome_empresa, current_signal, health_score, data_renovacao, journey_stage, cs_responsavel_id, comercial_responsavel_id, last_contact_at, pda_consumo_pct, tipo_lead",
      )
      .eq("ativo", true)
      .limit(5000);
    if (args.sinaleira) q = q.eq("current_signal", String(args.sinaleira));
    if (args.etapa) q = q.eq("journey_stage", String(args.etapa));
    if (args.responsavel) {
      const ids = idsPorNome(porId, String(args.responsavel));
      if (!ids.length) return { erro: `Ninguém com o nome "${args.responsavel}"` };
      q = q.in("cs_responsavel_id", ids);
    }
    if (args.renova_em_dias) {
      const hoje = new Date().toISOString().slice(0, 10);
      const fim = new Date(Date.now() + Number(args.renova_em_dias) * 86400000)
        .toISOString()
        .slice(0, 10);
      q = q.gte("data_renovacao", hoje).lte("data_renovacao", fim);
    }
    if (args.sem_contato_dias)
      q = q.or(
        `last_contact_at.is.null,last_contact_at.lt.${diasAtras(Number(args.sem_contato_dias))}`,
      );
    const { data, error } = await q;
    if (error) return { erro: error.message };
    const lista = (data ?? []) as Row[];
    const conta = (campo: string) => {
      const m: Record<string, number> = {};
      for (const c of lista) {
        const k = s(c[campo]) ?? "—";
        m[k] = (m[k] ?? 0) + 1;
      }
      return m;
    };
    return {
      quantidade: lista.length,
      por_sinaleira: conta("current_signal"),
      por_etapa: conta("journey_stage"),
      amostra: lista
        .sort((a, b) =>
          String(a.data_renovacao ?? "9").localeCompare(String(b.data_renovacao ?? "9")),
        )
        .slice(0, 25)
        .map((c) => ({
          nome: c.nome_empresa,
          sinaleira: c.current_signal,
          saude: c.health_score,
          renovacao: c.data_renovacao,
          etapa: c.journey_stage,
          cs: porId.get(String(c.cs_responsavel_id)) ?? null,
          comercial: porId.get(String(c.comercial_responsavel_id)) ?? null,
          ultimo_contato: s(c.last_contact_at)?.slice(0, 10) ?? null,
          link: `/empresas/${c.client_uid}`,
        })),
    };
  }

  if (nome === "detalhar_empresa") {
    const porId = await perfis(db);
    const t = termoSeguro(String(args.nome_ou_uid ?? ""));
    const { data: emps } = await db
      .from("companies")
      .select("id, uid, nome, cnpj, segmento, owner_user_id, owner_original")
      .or(`uid.eq.${t.toUpperCase()},nome.ilike.%${t}%`)
      .limit(5);
    const lista = (emps ?? []) as Row[];
    if (!lista.length) return { erro: "Empresa não encontrada" };
    const e = lista[0];
    const [ficha, negocios, contatos] = await Promise.all([
      db
        .from("cs_clients")
        .select(
          "client_uid, current_signal, health_score, data_renovacao, journey_stage, cs_responsavel_id, comercial_responsavel_id, last_contact_at, pda_consumo_pct, login_pda",
        )
        .eq("company_id", String(e.id))
        .maybeSingle(),
      db
        .from("deals")
        .select("id, nome, status, amount, closed_at")
        .eq("company_id", String(e.id))
        .order("created_at", { ascending: false })
        .limit(30),
      db.from("contacts").select("id, nome, cargo, email").eq("company_id", String(e.id)).limit(30),
    ]);
    const f = ficha.data as Row | null;
    const negs = (negocios.data ?? []) as Row[];
    return {
      outras_empresas_com_nome_parecido: lista.slice(1).map((x) => x.nome),
      empresa: {
        nome: e.nome,
        uid: e.uid,
        cnpj: e.cnpj,
        segmento: e.segmento,
        dono: porId.get(String(e.owner_user_id)) ?? s(e.owner_original),
        link: f ? `/empresas/${f.client_uid}` : `/jornada?empresa=${e.id}`,
      },
      ficha_cs: f
        ? {
            sinaleira: f.current_signal,
            saude: f.health_score,
            renovacao: f.data_renovacao,
            etapa: f.journey_stage,
            consumo_pda: f.pda_consumo_pct,
            login_pda: f.login_pda,
            cs: porId.get(String(f.cs_responsavel_id)) ?? null,
            comercial: porId.get(String(f.comercial_responsavel_id)) ?? null,
            ultimo_contato: s(f.last_contact_at)?.slice(0, 10) ?? null,
          }
        : null,
      negocios: {
        ganhos: negs.filter((d) => d.status === "won").length,
        abertos: negs.filter((d) => d.status === "open").length,
        perdidos: negs.filter((d) => d.status === "lost").length,
        valor_ganho: brl(
          negs.filter((d) => d.status === "won").reduce((t, d) => t + (Number(d.amount) || 0), 0),
        ),
        recentes: negs.slice(0, 8).map((d) => ({
          nome: d.nome,
          status: d.status,
          valor: d.amount == null ? null : brl(Number(d.amount)),
          link: `/negocio/${d.id}`,
        })),
      },
      contatos: ((contatos.data ?? []) as Row[]).map((c) => ({
        nome: c.nome,
        cargo: c.cargo,
        email: c.email,
      })),
    };
  }

  if (nome === "detalhar_lead") {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as SupabaseClient;
    const t = String(args.id_ou_nome ?? "").trim();
    const ehUuid = /^[0-9a-f-]{36}$/i.test(t);
    const campos =
      "id, name, email, phone, position, company_name, stage_id, assigned_to, source, campaign, converted_at, created_at, oculto_sdr, contact_id, meeting_at, priority, score";
    // Mesmo acesso da página do lead: lead fora do kanban também abre.
    const { data: achados } = ehUuid
      ? await admin.from("leads").select(campos).eq("id", t).limit(1)
      : await admin
          .from("leads")
          .select(campos)
          .or(`name.ilike.%${termoSeguro(t)}%,email.ilike.%${termoSeguro(t)}%`)
          .limit(5);
    const lista = (achados ?? []) as Row[];
    if (!lista.length) return { erro: "Lead não encontrado" };
    const l = lista[0];
    const porId = await perfis(db);
    const [etapa, conversoes, notas, negs] = await Promise.all([
      l.stage_id
        ? db.from("stages").select("name").eq("id", String(l.stage_id)).maybeSingle()
        : { data: null },
      admin
        .from("lead_conversoes")
        .select("nome, ocorrida_em, canal")
        .eq("lead_id", String(l.id))
        .order("ocorrida_em", { ascending: false })
        .limit(15),
      admin
        .from("lead_notes")
        .select("content, created_at")
        .eq("lead_id", String(l.id))
        .order("created_at", { ascending: false })
        .limit(5),
      l.contact_id
        ? admin
            .from("deal_contacts")
            .select("deals(id, nome, status, amount)")
            .eq("contact_id", String(l.contact_id))
            .limit(10)
        : { data: [] },
    ]);
    return {
      outros_com_nome_parecido: lista
        .slice(1)
        .map((x) => ({ nome: x.name, link: `/lead/${x.id}` })),
      lead: {
        nome: l.name,
        email: l.email,
        telefone: l.phone,
        cargo: l.position,
        empresa: l.company_name,
        etapa: l.oculto_sdr ? "fora do kanban" : (s((etapa.data as Row | null)?.name) ?? null),
        dono: porId.get(String(l.assigned_to)) ?? null,
        origem: l.source,
        campanha: l.campaign,
        prioridade: l.priority,
        score: l.score,
        reuniao: l.meeting_at,
        entrou_em: s(l.created_at)?.slice(0, 10),
        link: `/lead/${l.id}`,
      },
      conversoes: ((conversoes.data ?? []) as Row[]).map((c) => ({
        evento: c.canal === "oportunidade" ? "Marcado como oportunidade" : c.nome,
        em: s(c.ocorrida_em)?.slice(0, 10),
      })),
      anotacoes: ((notas.data ?? []) as Row[]).map((n) => ({
        texto: s(n.content)?.slice(0, 300),
        em: s(n.created_at)?.slice(0, 10),
      })),
      negocios: ((negs.data ?? []) as Row[])
        .map((v) => v.deals as Row | null)
        .filter(Boolean)
        .map((d) => ({
          nome: d!.nome,
          status: d!.status,
          valor: d!.amount == null ? null : brl(Number(d!.amount)),
          link: `/negocio/${d!.id}`,
        })),
    };
  }

  if (nome === "consultar_propostas") {
    let q = db
      .from("propostas")
      .select("id, numero, status, valor_final, enviada_em, aceita_em, created_at, deal_id")
      .order("created_at", { ascending: false })
      .limit(2000);
    if (args.status) q = q.eq("status", String(args.status));
    if (args.dias) q = q.gte("created_at", diasAtras(Number(args.dias)));
    const { data, error } = await q;
    if (error) return { erro: error.message };
    const lista = (data ?? []) as Row[];
    const porStatus: Record<string, number> = {};
    for (const p of lista) porStatus[String(p.status)] = (porStatus[String(p.status)] ?? 0) + 1;
    return {
      quantidade: lista.length,
      valor_total: brl(lista.reduce((t, p) => t + (Number(p.valor_final) || 0), 0)),
      por_status: porStatus,
      amostra: lista.slice(0, 20).map((p) => ({
        numero: p.numero,
        status: p.status,
        valor: p.valor_final == null ? null : brl(Number(p.valor_final)),
        enviada_em: s(p.enviada_em)?.slice(0, 10) ?? null,
        aceita_em: s(p.aceita_em)?.slice(0, 10) ?? null,
        link: p.deal_id ? `/negocio/${p.deal_id}` : "/propostas",
      })),
    };
  }

  return { erro: `Ferramenta desconhecida: ${nome}` };
}
