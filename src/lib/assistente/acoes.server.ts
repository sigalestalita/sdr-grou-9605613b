import type { SupabaseClient } from "@supabase/supabase-js";

/*
 * Ferramentas da assistente além das consultas prontas:
 *  - consultar_base / descrever_base: leitura genérica das tabelas do CRM
 *    (lista fechada abaixo), sempre com o acesso (RLS) de quem pergunta;
 *  - criar negócio, definir itens, gerar proposta (rascunho), criar relatório
 *    e criar segmentação, pelas mesmas regras das telas.
 * Toda ferramenta que cria ou altera exige confirmado: true — a assistente
 * resume o que vai fazer e só executa depois do "sim" da pessoa.
 */

type Row = Record<string, unknown>;

/** Tabelas que a assistente pode ler (tokens, logs técnicos e notificações ficam de fora). */
export const TABELAS_DA_BASE: Record<string, string> = {
  leads: "Leads do SDR e da base de marketing (etapa, origem, dono, score)",
  lead_conversoes: "Conversões dos leads (formulários, campanhas, datas)",
  lead_notes: "Anotações nos leads",
  lead_touches: "Touches/tentativas de contato do SDR",
  lead_interactions: "Interações registradas com leads",
  contacts: "Contatos (pessoas) das empresas",
  companies: "Empresas (CNPJ, domínio, cidade, dono, empresa-mãe)",
  company_contacts: "Ligação empresa × contato",
  company_activities: "Atividades registradas nas empresas",
  deals: "Negócios comerciais (funil, etapa, valor, status, executivo/dono, datas de ganho)",
  deal_activities: "Atividades dos negócios (ligações, reuniões, notas)",
  deal_products: "Itens (produtos/serviços) de cada negócio",
  deal_contacts: "Contatos ligados a cada negócio",
  products: "Catálogo de produtos e serviços (preço de tabela, modelo de proposta)",
  pipelines: "Funis comerciais",
  pipeline_stages: "Etapas dos funis comerciais",
  stages: "Etapas do kanban do SDR",
  propostas: "Propostas (status, valores, envio, abertura, aceite)",
  proposta_modelos: "Modelos de texto das propostas",
  commercial_goals: "Metas comerciais",
  cs_clients: "Carteira do CS (sinaleira, saúde, renovação, responsáveis)",
  cs_contacts: "Contatos da carteira do CS",
  cs_tasks: "Tarefas do CS",
  cs_meetings: "Reuniões do CS",
  cs_timeline_events: "Linha do tempo dos clientes do CS",
  cs_alerts: "Alertas do CS",
  cs_signal_snapshots: "Histórico da sinaleira",
  cs_cadence_tasks: "Cards da cadência semanal do CS",
  cs_oportunidades: "Oportunidades levantadas pelo CS",
  cs_sales: "Vendas registradas pelo CS",
  cs_tickets: "Tickets do CS",
  cs_plataforma_uso: "Uso da Plataforma de CS por empresa",
  cs_masterclass_participations: "Participação em masterclasses",
  cs_client_tags: "Tags dos clientes",
  cs_records: "Registros manuais nos clientes do CS",
  cs_ausencias: "Ausências (férias etc.) do time de CS",
  analistas_pda: "Analistas PDA por empresa",
  tickets: "Tickets internos",
  faturas: "Faturas (faturamento)",
  fatura_parcelas: "Parcelas das faturas",
  company_faturamento: "Política de faturamento das empresas",
  requerimentos: "Requerimentos (trainers, turmas, sessões)",
  turmas: "Turmas de treinamento",
  turma_inscricoes: "Inscrições nas turmas",
  licencas_pda: "Licenças PDA",
  comissao_linhas: "Linhas de comissão",
  comissao_fechamentos: "Fechamentos de comissão",
  contrato_solicitacoes: "Solicitações de contrato",
  fichas_cadastrais: "Fichas cadastrais de clientes",
  email_campanhas: "Campanhas de e-mail marketing",
  email_segmentos: "Segmentações de e-mail marketing",
  email_envios: "Envios de e-mail marketing (aberturas, cliques)",
  whatsapp_campaigns: "Campanhas de WhatsApp",
  whatsapp_conversations: "Conversas de WhatsApp",
  meta_ads_campanhas: "Campanhas do Meta Ads",
  meta_ads_diario: "Resultados diários do Meta Ads",
  mkt_conversoes: "Conversões de marketing",
  relatorios_salvos: "Relatórios salvos",
  empresas_solicitacoes: "Pedidos de mescla/exclusão/filiais de empresas",
  ca_vendas: "Vendas no Conta Azul",
  ca_receber: "Contas a receber no Conta Azul",
  ca_notas: "Notas fiscais no Conta Azul",
  profiles: "Pessoas do time (id, nome, e-mail) — para traduzir ids de usuário",
  teams: "Times",
  user_teams: "Quem está em cada time",
};

const SENSIVEL = /(token|secret|senha|password|api_key|chave)/i;
const COLUNA = /^[a-z_][a-z0-9_]*$/;
// Colunas no formato do PostgREST, inclusive relações: "id, nome, companies:company_id(nome)".
const SELECAO = /^[a-zA-Z0-9_,\s:()*.!]+$/;

function limpar(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(limpar);
  if (v && typeof v === "object") {
    const out: Row = {};
    for (const [k, x] of Object.entries(v as Row)) if (!SENSIVEL.test(k)) out[k] = limpar(x);
    return out;
  }
  if (typeof v === "string" && v.length > 600) return `${v.slice(0, 600)}…`;
  return v;
}

const num = (v: unknown, padrao: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : padrao;
};

type Filtro = { coluna: string; operador: string; valor?: unknown };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function aplicarFiltros(q: any, filtros: Filtro[]) {
  for (const f of filtros) {
    if (!COLUNA.test(f.coluna)) throw new Error(`Coluna inválida: ${f.coluna}`);
    const v = f.valor == null ? "" : String(f.valor);
    const seguro = v.replace(/[%,()]/g, " ");
    switch (f.operador) {
      case "igual":
        q = q.eq(f.coluna, v);
        break;
      case "diferente":
        q = q.neq(f.coluna, v);
        break;
      case "maior":
        q = q.gt(f.coluna, v);
        break;
      case "maior_igual":
        q = q.gte(f.coluna, v);
        break;
      case "menor":
        q = q.lt(f.coluna, v);
        break;
      case "menor_igual":
        q = q.lte(f.coluna, v);
        break;
      case "contem":
        q = q.ilike(f.coluna, `%${seguro}%`);
        break;
      case "comeca":
        q = q.ilike(f.coluna, `${seguro}%`);
        break;
      case "nulo":
        q = q.is(f.coluna, null);
        break;
      case "nao_nulo":
        q = q.not(f.coluna, "is", null);
        break;
      case "em":
        q = q.in(
          f.coluna,
          v
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
        );
        break;
      default:
        throw new Error(`Operador inválido: ${f.operador}`);
    }
  }
  return q;
}

async function consultarBase(db: SupabaseClient, a: Row) {
  const tabela = String(a.tabela ?? "");
  if (!TABELAS_DA_BASE[tabela])
    throw new Error(`Tabela fora da lista. Use descrever_base para ver as tabelas.`);
  const filtros = (Array.isArray(a.filtros) ? a.filtros : []) as Filtro[];
  if (filtros.length > 12) throw new Error("Filtros demais (máx. 12)");

  // Agrupado: conta (e soma) por uma coluna, lendo até 20 mil linhas.
  const agrupar = a.agrupar_por ? String(a.agrupar_por) : null;
  if (agrupar) {
    if (!COLUNA.test(agrupar)) throw new Error("Coluna de agrupamento inválida");
    const somar = a.somar ? String(a.somar) : null;
    if (somar && !COLUNA.test(somar)) throw new Error("Coluna de soma inválida");
    const grupos = new Map<string, { quantidade: number; soma: number }>();
    let lidas = 0;
    for (let de = 0; de < 20_000; de += 1000) {
      const q = aplicarFiltros(
        db
          .from(tabela)
          .select(somar ? `${agrupar}, ${somar}` : agrupar)
          .range(de, de + 999),
        filtros,
      );
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as Row[];
      for (const r of rows) {
        const k = r[agrupar] == null ? "(vazio)" : String(r[agrupar]);
        const g = grupos.get(k) ?? { quantidade: 0, soma: 0 };
        g.quantidade++;
        if (somar) g.soma += Number(r[somar] ?? 0) || 0;
        grupos.set(k, g);
      }
      lidas += rows.length;
      if (rows.length < 1000) break;
    }
    const lista = [...grupos.entries()]
      .map(([valor, g]) => ({
        [agrupar]: valor,
        quantidade: g.quantidade,
        ...(somar ? { soma: g.soma } : {}),
      }))
      .sort((x, y) =>
        somar ? Number(y.soma) - Number(x.soma) : Number(y.quantidade) - Number(x.quantidade),
      );
    return {
      linhas_lidas: lidas,
      truncado: lidas >= 20_000,
      grupos: lista.slice(0, 60),
      total_de_grupos: lista.length,
    };
  }

  const colunas = String(a.colunas ?? "*").trim() || "*";
  if (!SELECAO.test(colunas)) throw new Error("Lista de colunas inválida");
  const limite = num(a.limite, 30, 1, 100);
  let q = db.from(tabela).select(colunas, { count: "exact" }).limit(limite);
  q = aplicarFiltros(q, filtros);
  if (a.ordenar_por) {
    const o = String(a.ordenar_por);
    if (!COLUNA.test(o)) throw new Error("Coluna de ordenação inválida");
    q = q.order(o, { ascending: a.crescente === true, nullsFirst: false });
  }
  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  return { total: count ?? null, mostrando: (data ?? []).length, linhas: limpar(data ?? []) };
}

async function descreverBase(db: SupabaseClient, a: Row) {
  const pedidas = (Array.isArray(a.tabelas) ? a.tabelas : [])
    .map(String)
    .filter((t) => TABELAS_DA_BASE[t])
    .slice(0, 8);
  if (!pedidas.length)
    return {
      tabelas: Object.entries(TABELAS_DA_BASE).map(([tabela, descricao]) => ({
        tabela,
        descricao,
      })),
      dica: "Peça as colunas de até 8 tabelas com descrever_base({tabelas: [...]}).",
    };
  const { data, error } = await db.rpc(
    "assistente_colunas" as never,
    { _tabelas: pedidas } as never,
  );
  if (error) throw new Error(error.message);
  const por = new Map<string, string[]>();
  for (const r of (data ?? []) as Array<{ tabela: string; coluna: string; tipo: string }>)
    por.set(r.tabela, [...(por.get(r.tabela) ?? []), `${r.coluna} (${r.tipo})`]);
  return pedidas.map((t) => ({
    tabela: t,
    descricao: TABELAS_DA_BASE[t],
    colunas: por.get(t) ?? [],
  }));
}

// ------------------------------------------------------------- catálogos
async function catalogoProdutos(db: SupabaseClient, a: Row) {
  const termo = a.termo
    ? String(a.termo)
        .replace(/[%,()]/g, " ")
        .trim()
    : "";
  let q = db
    .from("products")
    .select(
      "id, nome, marca, tipo, subcategoria, preco_tabela, parcelamento_max, proposta_modelo_id",
    )
    .eq("ativo", true)
    .order("nome")
    .limit(80);
  if (termo) q = q.ilike("nome", `%${termo}%`);
  const [{ data: produtos, error }, { data: modelos }] = await Promise.all([
    q,
    db.from("proposta_modelos").select("id, nome, padrao, ativo").eq("ativo", true).order("nome"),
  ]);
  if (error) throw new Error(error.message);
  return { produtos: produtos ?? [], modelos_de_proposta: modelos ?? [] };
}

async function opcoesSegmentacao(db: SupabaseClient) {
  const { CAMPOS_SEGMENTO, OPERADORES } = await import("@/lib/email-marketing/campos");
  const [{ data: etapas }, { data: pessoas }] = await Promise.all([
    db.from("stages").select("slug, name").order("position"),
    db.from("profiles").select("id, full_name").order("full_name"),
  ]);
  return {
    regras: {
      base: "todos | kanban (leads do SDR) | marketing (base do RD)",
      origens: "lista de origens (source) exatas do lead",
      tipos: "tipos de lead (empresa, pessoa_fisica, consultoria)",
      etapas: "slugs das etapas do kanban (abaixo)",
      prioridades: "prioridades do lead",
      responsaveis: "ids de pessoas (dono do lead)",
      carteiras: "ids de executivos: empresas da carteira dele",
      sinaleiras: "verde, amarelo, vermelho, preto",
      cliente: "'' | sim | nao (é cliente do CS)",
      campanha_contem: "texto na campanha",
      conversao_contem: "texto no nome da conversão",
      email_contem: "texto no e-mail (ex.: @gmail)",
      converteu_desde: "AAAA-MM-DD",
      criado_desde: "AAAA-MM-DD",
      criado_ate: "AAAA-MM-DD",
      empresas: "[{id, nome}] de empresas (ache com buscar_registros)",
      condicoes: "[{campo, operador, valor}] com os campos e operadores abaixo",
    },
    campos: CAMPOS_SEGMENTO.map((c) => ({ id: c.id, rotulo: c.rotulo, grupo: c.grupo })),
    operadores: OPERADORES.map((o) => ({ id: o.id, rotulo: o.rotulo })),
    etapas: etapas ?? [],
    pessoas: ((pessoas ?? []) as Row[]).map((p) => ({ id: p.id, nome: p.full_name })),
  };
}

async function previaSegmentacao(db: SupabaseClient, a: Row) {
  const { RegrasSchema } = await import("@/lib/email-marketing.functions");
  const regras = RegrasSchema.parse(a.regras ?? {});
  const [cont, amostra] = await Promise.all([
    db.rpc("email_segmento_contagem" as never, { regras } as never),
    db.rpc("email_segmento_leads" as never, { regras, limite: 10 } as never),
  ]);
  if (cont.error) throw new Error(cont.error.message);
  return { total: Number(cont.data ?? 0), regras, amostra: amostra.data ?? [] };
}

// ------------------------------------------------------------- ações
const PEDIR_CONFIRMACAO = {
  precisa_confirmar: true,
  instrucao:
    "Não foi executado. Resuma para a pessoa exatamente o que será criado/alterado e pergunte se pode seguir. Só chame de novo com confirmado: true depois do sim.",
};

async function criarNegocio(db: SupabaseClient, userId: string, a: Row) {
  const { CriarNegocioSchema, criarNegocioNucleo } =
    await import("@/lib/comercial-negocio.functions");
  const dados = CriarNegocioSchema.parse({
    empresaId: a.empresa_id ?? null,
    empresaNome: a.empresa_nome ?? "",
    tipoEmpresa: a.tipo_empresa ?? "empresa",
    contato: a.contato ?? null,
    nome: a.nome ?? "",
    pipelineId: a.funil_id ?? null,
    valor: a.valor ?? 0,
    produtos: a.produtos ?? null,
    fonte: a.fonte ?? null,
    executivoId: a.executivo_id ?? null,
    proximoPasso: a.proximo_passo ?? null,
    proximoPassoEm: a.proximo_passo_em ?? null,
  });
  const r = await criarNegocioNucleo(db, userId, dados);
  return { ...r, link: `/negocio/${r.dealId}` };
}

async function definirItens(db: SupabaseClient, a: Row) {
  const { SalvarItensSchema, salvarItensNucleo } = await import("@/lib/catalogo.functions");
  const dealId = String(a.negocio_id ?? "");
  const brutos = (Array.isArray(a.itens) ? a.itens : []) as Row[];
  // Produto pelo id ou pelo nome do catálogo; sem valor, vale o preço de tabela.
  const { data: catalogo } = await db
    .from("products")
    .select("id, nome, preco_tabela")
    .eq("ativo", true)
    .limit(1000);
  const prods = (catalogo ?? []) as Array<{
    id: string;
    nome: string;
    preco_tabela: number | null;
  }>;
  const achar = (ref: string) => {
    const r = ref.trim().toLowerCase();
    return (
      prods.find((p) => p.id === ref) ??
      prods.find((p) => p.nome.toLowerCase() === r) ??
      prods.find((p) => p.nome.toLowerCase().includes(r)) ??
      null
    );
  };
  const itens = brutos.map((i) => {
    const p = i.produto ? achar(String(i.produto)) : null;
    if (i.produto && !p)
      throw new Error(`Produto não encontrado no catálogo: ${String(i.produto)}`);
    const valor = i.valor_unitario ?? p?.preco_tabela;
    if (valor == null) throw new Error(`Informe o valor de "${String(i.nome ?? i.produto)}"`);
    return {
      product_id: p?.id ?? null,
      nome: String(i.nome ?? p?.nome ?? ""),
      quantidade: Number(i.quantidade ?? 1),
      valor_unitario: Number(valor),
      desconto_tipo: i.desconto_tipo === "valor" ? "valor" : "pct",
      desconto: Number(i.desconto ?? 0),
      recorrencia: ["mensal", "anual"].includes(String(i.recorrencia)) ? i.recorrencia : "unico",
    };
  });
  const dados = SalvarItensSchema.parse({
    dealId,
    itens,
    valorImpostos: a.valor_impostos == null ? null : Number(a.valor_impostos),
  });
  const r = await salvarItensNucleo(db, dados);
  return { ...r, itens: itens.length, link: `/negocio/${dealId}` };
}

async function gerarProposta(db: SupabaseClient, userId: string, a: Row) {
  const { GerarPropostaSchema, gerarPropostaNucleo } = await import("@/lib/propostas.functions");
  const { modelosDosItens } = await import("@/lib/propostas/render");
  const { PUBLIC_SITE_URL } = await import("@/lib/propostas/site");
  const dealId = String(a.negocio_id ?? "");
  let modeloIds = (Array.isArray(a.modelo_ids) ? a.modelo_ids : []).map(String);
  if (!modeloIds.length) {
    // Como na tela: os modelos ligados aos produtos dos itens; sem nenhum, o padrão.
    const [{ data: itens }, { data: padrao }] = await Promise.all([
      db
        .from("deal_products")
        .select("products:product_id(proposta_modelo_id)")
        .eq("deal_id", dealId),
      db
        .from("proposta_modelos")
        .select("id")
        .eq("padrao", true)
        .eq("ativo", true)
        .limit(1)
        .maybeSingle(),
    ]);
    modeloIds = modelosDosItens(
      (
        (itens ?? []) as unknown as Array<{
          products: { proposta_modelo_id: string | null } | null;
        }>
      ).map((i) => i.products?.proposta_modelo_id),
      (padrao as { id: string } | null)?.id ?? null,
    );
  }
  const dados = GerarPropostaSchema.parse({
    dealId,
    modeloIds,
    contactId: a.contato_id ?? null,
    pagamento: String(a.pagamento ?? ""),
    validadeDias: Number(a.validade_dias ?? 15),
    observacoes: String(a.observacoes ?? ""),
  });
  const r = await gerarPropostaNucleo(db, userId, dados);
  return {
    numero: r.numero,
    status: "rascunho (não foi enviada ao cliente)",
    link_no_compass: `/negocio/${dealId}`,
    link_do_cliente: `${PUBLIC_SITE_URL}/proposta/${r.token}`,
  };
}

async function criarRelatorio(db: SupabaseClient, a: Row) {
  const { SpecSchema, normalizarSpec } = await import("@/lib/relatorios/catalogo");
  const { executarRelatorio } = await import("@/lib/relatorios/executar.server");
  const spec = normalizarSpec(SpecSchema.parse(a.spec));
  const res = await executarRelatorio(db, spec);
  const { data, error } = await db
    .from("relatorios_salvos" as never)
    .insert({
      nome: String(a.nome ?? spec.titulo).slice(0, 160),
      pergunta: a.pedido ? String(a.pedido).slice(0, 1000) : null,
      spec,
      compartilhado: a.compartilhado === true,
    } as never)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const id = String((data as Row).id);
  return {
    id,
    link: `/relatorios?r=${id}`,
    registros: res.registros,
    colunas: res.colunas.map((c) => c.nome),
    primeiras_linhas: res.linhas.slice(0, 12),
    totais: res.totais,
  };
}

async function criarSegmentacao(db: SupabaseClient, a: Row) {
  const { RegrasSchema } = await import("@/lib/email-marketing.functions");
  const regras = RegrasSchema.parse(a.regras ?? {});
  if (regras.lista) throw new Error("Segmentação por lista se cria subindo a lista na tela");
  const { data: cont } = await db.rpc("email_segmento_contagem" as never, { regras } as never);
  const agora = new Date().toISOString();
  const { data, error } = await db
    .from("email_segmentos" as never)
    .insert({
      nome: String(a.nome ?? "").slice(0, 160) || "Segmentação",
      descricao: a.descricao ? String(a.descricao).slice(0, 500) : null,
      regras,
      ultima_contagem: Number(cont ?? 0),
      contado_em: agora,
      updated_at: agora,
    } as never)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const id = String((data as Row).id);
  return { id, total: Number(cont ?? 0), link: `/email-marketing/segmentos?s=${id}` };
}

// ------------------------------------------------------------- definição
const FILTROS_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      coluna: { type: "string" },
      operador: {
        type: "string",
        enum: [
          "igual",
          "diferente",
          "maior",
          "maior_igual",
          "menor",
          "menor_igual",
          "contem",
          "comeca",
          "nulo",
          "nao_nulo",
          "em",
        ],
      },
      valor: { type: "string", description: "Para 'em', valores separados por vírgula" },
    },
    required: ["coluna", "operador"],
  },
};
const CONFIRMADO = {
  type: "boolean",
  description: "true só depois que a pessoa confirmou no chat. Sem isso nada é feito.",
};

export const FERRAMENTAS_ACOES = [
  {
    type: "function",
    function: {
      name: "descrever_base",
      description:
        "Lista as tabelas do CRM que podem ser consultadas; com 'tabelas', mostra as colunas delas. Use antes de consultar_base quando não souber os nomes das colunas.",
      parameters: {
        type: "object",
        properties: { tabelas: { type: "array", items: { type: "string" } } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_base",
      description:
        "Consulta genérica e só de leitura de qualquer tabela da lista (descrever_base), com o acesso de quem pergunta. Modo lista: colunas (formato PostgREST, aceita relação como 'companies:company_id(nome)'), filtros, ordenar_por, limite (máx. 100) — devolve o total exato. Modo agrupado: agrupar_por (+ somar) devolve quantidade (e soma) por valor, lendo até 20 mil linhas. Para nomes de pessoas a partir de ids, consulte profiles.",
      parameters: {
        type: "object",
        properties: {
          tabela: { type: "string" },
          colunas: { type: "string" },
          filtros: FILTROS_SCHEMA,
          ordenar_por: { type: "string" },
          crescente: { type: "boolean" },
          limite: { type: "number" },
          agrupar_por: { type: "string" },
          somar: { type: "string" },
        },
        required: ["tabela"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "catalogo_produtos",
      description:
        "Produtos e serviços ativos do catálogo (id, preço de tabela, modelo de proposta ligado) e os modelos de proposta ativos. Use antes de definir itens ou gerar proposta.",
      parameters: { type: "object", properties: { termo: { type: "string" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "criar_negocio",
      description:
        "Abre um negócio comercial (como o botão 'Novo negócio'): empresa existente (empresa_id, ache com buscar_registros) ou nova (empresa_nome), contato opcional, funil (padrão Novos Negócios). Só gestão abre no nome de outro executivo. EXIGE confirmado: true.",
      parameters: {
        type: "object",
        properties: {
          empresa_id: { type: "string" },
          empresa_nome: { type: "string" },
          tipo_empresa: { type: "string", enum: ["empresa", "pessoa_fisica", "consultoria"] },
          contato: {
            type: "object",
            properties: {
              nome: { type: "string" },
              email: { type: "string" },
              telefone: { type: "string" },
              cargo: { type: "string" },
            },
            required: ["nome"],
          },
          nome: { type: "string", description: "Nome do negócio (padrão: nome da empresa)" },
          funil_id: { type: "string" },
          valor: { type: "number" },
          produtos: { type: "string" },
          fonte: { type: "string" },
          executivo_id: { type: "string" },
          proximo_passo: { type: "string" },
          proximo_passo_em: { type: "string", description: "ISO 8601" },
          confirmado: CONFIRMADO,
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "definir_itens_negocio",
      description:
        "Define (substitui) os itens do negócio: produto do catálogo pelo nome ou id (sem valor_unitario vale o preço de tabela), quantidade, desconto (pct ou valor), recorrência. Recalcula o valor do negócio. EXIGE confirmado: true.",
      parameters: {
        type: "object",
        properties: {
          negocio_id: { type: "string" },
          itens: {
            type: "array",
            items: {
              type: "object",
              properties: {
                produto: { type: "string", description: "Nome ou id do produto no catálogo" },
                nome: { type: "string", description: "Para item fora do catálogo" },
                quantidade: { type: "number" },
                valor_unitario: { type: "number" },
                desconto_tipo: { type: "string", enum: ["pct", "valor"] },
                desconto: { type: "number" },
                recorrencia: { type: "string", enum: ["unico", "mensal", "anual"] },
              },
            },
          },
          valor_impostos: { type: "number" },
          confirmado: CONFIRMADO,
        },
        required: ["negocio_id", "itens"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "gerar_proposta",
      description:
        "Gera a proposta do negócio a partir dos itens (precisa ter itens) e dos modelos (sem modelo_ids, usa os ligados aos produtos ou o padrão). Fica em RASCUNHO: não envia nada ao cliente. Devolve o link no Compass e o link do cliente. EXIGE confirmado: true.",
      parameters: {
        type: "object",
        properties: {
          negocio_id: { type: "string" },
          modelo_ids: { type: "array", items: { type: "string" } },
          contato_id: { type: "string" },
          pagamento: { type: "string", description: "Condição de pagamento" },
          validade_dias: { type: "number" },
          observacoes: { type: "string" },
          confirmado: CONFIRMADO,
        },
        required: ["negocio_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "catalogo_relatorios",
      description:
        "Bases, dimensões, métricas e datas disponíveis para montar relatórios (ids exatos). Use antes de criar_relatorio.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "criar_relatorio",
      description:
        "Monta, roda e salva um relatório em Relatórios. spec: {base, titulo, dimensoes (0-2 ids), metricas (1-3 ids), periodo ({campo, de, ate} AAAA-MM-DD ou null), filtros ([{campo, operador: igual|diferente|contem, valor}]), ordenar_por (id ou null), ordem (desc|asc), limite (1-500), grafico (barras|linhas|pizza|tabela)}. Devolve as primeiras linhas e o link. EXIGE confirmado: true.",
      parameters: {
        type: "object",
        properties: {
          spec: { type: "object" },
          nome: { type: "string" },
          pedido: { type: "string", description: "O pedido da pessoa, em texto" },
          compartilhado: { type: "boolean" },
          confirmado: CONFIRMADO,
        },
        required: ["spec"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "opcoes_segmentacao",
      description:
        "Regras, campos, operadores, etapas e pessoas disponíveis para segmentações de e-mail marketing.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "previa_segmentacao",
      description:
        "Quantos contatos (com e-mail, sem descadastrados) uma segmentação teria, e uma amostra. Não salva nada.",
      parameters: {
        type: "object",
        properties: { regras: { type: "object" } },
        required: ["regras"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "criar_segmentacao",
      description:
        "Salva uma segmentação de e-mail marketing com as regras (veja opcoes_segmentacao). Rode previa_segmentacao antes. EXIGE confirmado: true.",
      parameters: {
        type: "object",
        properties: {
          nome: { type: "string" },
          descricao: { type: "string" },
          regras: { type: "object" },
          confirmado: CONFIRMADO,
        },
        required: ["nome", "regras"],
      },
    },
  },
];

const QUE_ALTERAM = new Set([
  "criar_negocio",
  "definir_itens_negocio",
  "gerar_proposta",
  "criar_relatorio",
  "criar_segmentacao",
]);

export async function executarAcao(
  db: SupabaseClient,
  userId: string,
  nome: string,
  a: Row,
): Promise<unknown> {
  if (QUE_ALTERAM.has(nome) && a.confirmado !== true) return PEDIR_CONFIRMACAO;
  switch (nome) {
    case "descrever_base":
      return descreverBase(db, a);
    case "consultar_base":
      return consultarBase(db, a);
    case "catalogo_produtos":
      return catalogoProdutos(db, a);
    case "criar_negocio":
      return criarNegocio(db, userId, a);
    case "definir_itens_negocio":
      return definirItens(db, a);
    case "gerar_proposta":
      return gerarProposta(db, userId, a);
    case "catalogo_relatorios": {
      const { catalogoComoTexto } = await import("@/lib/relatorios/catalogo");
      return catalogoComoTexto();
    }
    case "criar_relatorio":
      return criarRelatorio(db, a);
    case "opcoes_segmentacao":
      return opcoesSegmentacao(db);
    case "previa_segmentacao":
      return previaSegmentacao(db, a);
    case "criar_segmentacao":
      return criarSegmentacao(db, a);
    default:
      throw new Error(`Ferramenta desconhecida: ${nome}`);
  }
}
