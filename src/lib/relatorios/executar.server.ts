import type { SupabaseClient } from "@supabase/supabase-js";
import { baseDe, normalizarSpec, type Formato, type Spec } from "./catalogo";

/*
 * Roda um relatório do catálogo com o acesso de quem pede (cliente da sessão):
 * busca só as colunas necessárias, traduz ids em nomes, aplica filtros e
 * agrupa em memória. Até LIMITE_LINHAS registros por relatório.
 */
type Row = Record<string, unknown>;
const LIMITE_LINHAS = 40000;

const COLUNAS: Record<string, { tabela: string; campos: string }> = {
  negocios: {
    tabela: "deals",
    campos:
      "status, amount, closed_at, created_at, created_at_original, owner_user_id, owner_original, pipeline_id, stage_id, company_id, tipo_venda, fonte, temperatura",
  },
  leads: {
    tabela: "leads",
    campos:
      "stage_id, source, channel, campaign, ad_name, form_name, lead_type, priority, assigned_to, created_at, company_segment, company_size, meeting_at, first_approach_at, score",
  },
  carteira_cs: {
    tabela: "cs_clients",
    campos:
      "current_signal, journey_stage, cs_responsavel_id, comercial_responsavel_id, tipo_lead, tipo_servico, data_renovacao, health_score, aporte_valor",
  },
  propostas: {
    tabela: "propostas",
    campos: "status, valor_final, created_at, enviada_em, aceita_em, created_by",
  },
};

const STATUS_NEGOCIO: Record<string, string> = { open: "Aberto", won: "Ganho", lost: "Perdido" };
const mes = (v: unknown) => (v ? String(v).slice(0, 7) : "sem data");
const ano = (v: unknown) => (v ? String(v).slice(0, 4) : "sem data");
const txt = (v: unknown) => (v == null || v === "" ? "—" : String(v));

export type ResultadoRelatorio = {
  spec: Spec;
  colunas: Array<{ id: string; nome: string; tipo: "dimensao" | "metrica"; formato?: Formato }>;
  linhas: Array<Record<string, string | number | null>>;
  totais: Record<string, number | null>;
  registros: number;
  truncado: boolean;
};

async function nomesPorId(db: SupabaseClient, tabela: string, campo: string, ids: string[]) {
  const m = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db
      .from(tabela)
      .select(`id, ${campo}`)
      .in("id", ids.slice(i, i + 200));
    for (const r of (data ?? []) as unknown as Row[]) m.set(String(r.id), txt(r[campo]));
  }
  return m;
}

export async function executarRelatorio(
  db: SupabaseClient,
  specBruta: Spec,
): Promise<ResultadoRelatorio> {
  const spec = normalizarSpec(specBruta);
  const base = baseDe(spec.base)!;
  const fonte = COLUNAS[spec.base];

  // 1. Linhas (paginadas: a API devolve até 1000 por vez).
  const linhas: Row[] = [];
  let truncado = false;
  for (let de = 0; ; de += 1000) {
    let q = db
      .from(fonte.tabela)
      .select(fonte.campos)
      .range(de, de + 999);
    if (spec.base === "carteira_cs") q = q.eq("ativo", true);
    if (spec.periodo?.de) q = q.gte(spec.periodo.campo, spec.periodo.de);
    if (spec.periodo?.ate) q = q.lte(spec.periodo.campo, `${spec.periodo.ate}T23:59:59.999`);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    linhas.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < 1000) break;
    if (linhas.length >= LIMITE_LINHAS) {
      truncado = true;
      break;
    }
  }

  // 2. Nomes para os ids que aparecem nas dimensões/filtros usados.
  const usados = new Set([...spec.dimensoes, ...spec.filtros.map((f) => f.campo)]);
  const ids = (campo: string) => [
    ...new Set(
      linhas
        .map((l) => l[campo])
        .filter(Boolean)
        .map(String),
    ),
  ];
  const precisa = (...d: string[]) => d.some((x) => usados.has(x));
  const [pessoas, funis, etapasNeg, etapasLead, empresas] = await Promise.all([
    precisa("dono", "responsavel", "responsavel_cs", "responsavel_comercial", "criado_por")
      ? nomesPorId(db, "profiles", "full_name", [
          ...ids("owner_user_id"),
          ...ids("assigned_to"),
          ...ids("cs_responsavel_id"),
          ...ids("comercial_responsavel_id"),
          ...ids("created_by"),
        ])
      : new Map<string, string>(),
    precisa("funil") ? nomesPorId(db, "pipelines", "nome", ids("pipeline_id")) : new Map(),
    spec.base === "negocios" && precisa("etapa")
      ? nomesPorId(db, "pipeline_stages", "name", ids("stage_id"))
      : new Map(),
    spec.base === "leads" && precisa("etapa")
      ? nomesPorId(db, "stages", "name", ids("stage_id"))
      : new Map(),
    precisa("empresa") ? nomesPorId(db, "companies", "nome", ids("company_id")) : new Map(),
  ]);
  const pessoa = (id: unknown, original?: unknown) =>
    id ? (pessoas.get(String(id)) ?? "—") : original ? `${original} (sem usuário)` : "sem dono";

  const valorDim = (l: Row, d: string): string => {
    switch (`${spec.base}.${d}`) {
      case "negocios.status":
        return STATUS_NEGOCIO[String(l.status)] ?? txt(l.status);
      case "negocios.funil":
        return funis.get(String(l.pipeline_id)) ?? "sem funil";
      case "negocios.etapa":
        return etapasNeg.get(String(l.stage_id)) ?? "sem etapa";
      case "negocios.dono":
        return pessoa(l.owner_user_id, l.owner_original);
      case "negocios.empresa":
        return empresas.get(String(l.company_id)) ?? "sem empresa";
      case "negocios.tipo_venda":
        return txt(l.tipo_venda);
      case "negocios.fonte":
        return txt(l.fonte);
      case "negocios.temperatura":
        return txt(l.temperatura);
      case "negocios.mes_fechamento":
        return mes(l.closed_at);
      case "negocios.ano_fechamento":
        return ano(l.closed_at);
      case "negocios.mes_criacao":
        return mes(l.created_at_original ?? l.created_at);
      case "leads.etapa":
        return etapasLead.get(String(l.stage_id)) ?? "sem etapa";
      case "leads.origem":
        return txt(l.source);
      case "leads.canal":
        return txt(l.channel);
      case "leads.campanha":
        return txt(l.campaign);
      case "leads.anuncio":
        return txt(l.ad_name);
      case "leads.formulario":
        return txt(l.form_name);
      case "leads.tipo_lead":
        return txt(l.lead_type);
      case "leads.prioridade":
        return txt(l.priority);
      case "leads.responsavel":
        return pessoa(l.assigned_to);
      case "leads.segmento":
        return txt(l.company_segment);
      case "leads.porte":
        return txt(l.company_size);
      case "leads.mes_entrada":
        return mes(l.created_at);
      case "leads.ano_entrada":
        return ano(l.created_at);
      case "carteira_cs.sinaleira":
        return txt(l.current_signal);
      case "carteira_cs.etapa_jornada":
        return txt(l.journey_stage);
      case "carteira_cs.responsavel_cs":
        return pessoa(l.cs_responsavel_id);
      case "carteira_cs.responsavel_comercial":
        return pessoa(l.comercial_responsavel_id);
      case "carteira_cs.tipo_lead":
        return txt(l.tipo_lead);
      case "carteira_cs.tipo_servico":
        return txt(l.tipo_servico);
      case "carteira_cs.mes_renovacao":
        return mes(l.data_renovacao);
      case "propostas.status":
        return txt(l.status);
      case "propostas.criado_por":
        return pessoa(l.created_by);
      case "propostas.mes_criacao":
        return mes(l.created_at);
      case "propostas.mes_envio":
        return mes(l.enviada_em);
      default:
        return "—";
    }
  };

  // 3. Filtros (sobre o valor já traduzido, sem diferenciar caixa).
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const filtradas = linhas.filter((l) =>
    spec.filtros.every((f) => {
      const v = norm(valorDim(l, f.campo));
      const alvo = norm(f.valor);
      if (f.operador === "igual") return v === alvo;
      if (f.operador === "diferente") return v !== alvo;
      return v.includes(alvo);
    }),
  );

  // 4. Agrupamento e métricas.
  type Acc = { n: number; soma: number; nSoma: number; contatados: number; reuniao: number };
  const grupos = new Map<string, { chaves: string[]; acc: Acc }>();
  const somaDe = (l: Row): number | null => {
    const v =
      spec.base === "negocios"
        ? l.amount
        : spec.base === "propostas"
          ? l.valor_final
          : spec.base === "carteira_cs"
            ? spec.metricas.includes("saude_media")
              ? l.health_score
              : l.aporte_valor
            : l.score;
    return v == null || v === "" ? null : Number(v);
  };
  // Saúde média e aporte total podem vir juntos: guarda os dois.
  const aporte = new Map<string, number>();
  for (const l of filtradas) {
    const chaves = spec.dimensoes.map((d) => valorDim(l, d));
    const k = chaves.join("\u0001");
    const g = grupos.get(k) ?? {
      chaves,
      acc: { n: 0, soma: 0, nSoma: 0, contatados: 0, reuniao: 0 },
    };
    g.acc.n++;
    const v = somaDe(l);
    if (v != null && Number.isFinite(v)) {
      g.acc.soma += v;
      g.acc.nSoma++;
    }
    if (spec.base === "carteira_cs" && l.aporte_valor != null)
      aporte.set(k, (aporte.get(k) ?? 0) + (Number(l.aporte_valor) || 0));
    if (l.first_approach_at) g.acc.contatados++;
    if (l.meeting_at) g.acc.reuniao++;
    grupos.set(k, g);
  }
  const metrica = (id: string, a: Acc, k: string): number | null => {
    switch (id) {
      case "quantidade":
        return a.n;
      case "valor_total":
        return Math.round(a.soma * 100) / 100;
      case "ticket_medio":
      case "valor_medio":
        return a.nSoma ? Math.round((a.soma / a.nSoma) * 100) / 100 : null;
      case "contatados":
        return a.contatados;
      case "com_reuniao":
        return a.reuniao;
      case "taxa_reuniao":
        return a.n ? Math.round((a.reuniao / a.n) * 1000) / 10 : null;
      case "score_medio":
      case "saude_media":
        return a.nSoma ? Math.round((a.soma / a.nSoma) * 10) / 10 : null;
      case "aporte_total":
        return Math.round((aporte.get(k) ?? 0) * 100) / 100;
      default:
        return null;
    }
  };

  let saida = [...grupos.entries()].map(([k, g]) => {
    const linha: Record<string, string | number | null> = {};
    spec.dimensoes.forEach((d, i) => (linha[d] = g.chaves[i]));
    for (const m of spec.metricas) linha[m] = metrica(m, g.acc, k);
    return linha;
  });

  const ordem = spec.ordenar_por ?? spec.metricas[0];
  const ehTempo = (d: string) => /^(mes|ano)_/.test(d);
  saida.sort((a, b) => {
    const chave = spec.ordenar_por ?? (spec.dimensoes.find(ehTempo) || ordem);
    const va = a[chave];
    const vb = b[chave];
    const dir = spec.ordenar_por ? (spec.ordem === "asc" ? 1 : -1) : ehTempo(chave) ? 1 : -1;
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
    return String(va ?? "").localeCompare(String(vb ?? "")) * dir;
  });
  saida = saida.slice(0, spec.limite);

  const totalGeral: Acc = { n: 0, soma: 0, nSoma: 0, contatados: 0, reuniao: 0 };
  for (const g of grupos.values()) {
    totalGeral.n += g.acc.n;
    totalGeral.soma += g.acc.soma;
    totalGeral.nSoma += g.acc.nSoma;
    totalGeral.contatados += g.acc.contatados;
    totalGeral.reuniao += g.acc.reuniao;
  }
  const aporteTotal = [...aporte.values()].reduce((t, v) => t + v, 0);
  const totais: Record<string, number | null> = {};
  for (const m of spec.metricas)
    totais[m] = m === "aporte_total" ? aporteTotal : metrica(m, totalGeral, "");

  return {
    spec,
    colunas: [
      ...spec.dimensoes.map((d) => ({
        id: d,
        nome: base.dimensoes.find((x) => x.id === d)!.nome,
        tipo: "dimensao" as const,
      })),
      ...spec.metricas.map((m) => {
        const def = base.metricas.find((x) => x.id === m)!;
        return { id: m, nome: def.nome, tipo: "metrica" as const, formato: def.formato };
      }),
    ],
    linhas: saida,
    totais,
    registros: filtradas.length,
    truncado,
  };
}
