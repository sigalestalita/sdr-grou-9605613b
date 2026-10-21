/*
 * Relatório de campanhas da Meta × kanban do SDR. Lógica pura (testável):
 * recebe as linhas diárias da Meta, as campanhas e os leads do período e
 * devolve totais, série por dia e tabelas por campanha e por anúncio.
 *
 * Atribuição do lead: pela campanha gravada no lead; se ela não for uma
 * campanha da Meta (lead que veio pelo fluxo do RD fica com o nome do fluxo),
 * pelo nome do anúncio, que a planilha grava e o RD não troca.
 */

export type LinhaMeta = {
  dia: string;
  ad_id: string;
  ad_name: string | null;
  adset_name: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  gasto: number | string;
  impressoes: number | string;
  cliques: number | string;
  leads: number | string;
};

export type CampanhaMeta = {
  campaign_id: string;
  nome: string;
  status: string | null;
  orcamento_diario: number | string | null;
  orcamento_total: number | string | null;
  alterada_em: string | null;
};

export type LeadDoPeriodo = {
  campaign: string | null;
  ad_name: string | null;
  etapa: string | null;
  meeting_at: string | null;
};

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const div = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) / 100 : null);

type Acumulado = {
  gasto: number;
  impressoes: number;
  cliques: number;
  leads_meta: number;
  leads_compass: number;
  reunioes: number;
  descartados: number;
};
const vazio = (): Acumulado => ({
  gasto: 0,
  impressoes: 0,
  cliques: 0,
  leads_meta: 0,
  leads_compass: 0,
  reunioes: 0,
  descartados: 0,
});

function fechar(a: Acumulado) {
  return {
    gasto: Math.round(a.gasto * 100) / 100,
    impressoes: a.impressoes,
    cliques: a.cliques,
    ctr: a.impressoes > 0 ? Math.round((a.cliques / a.impressoes) * 10000) / 100 : null,
    leads_meta: a.leads_meta,
    cpl: div(a.gasto, a.leads_meta),
    leads_compass: a.leads_compass,
    reunioes: a.reunioes,
    descartados: a.descartados,
    custo_reuniao: div(a.gasto, a.reunioes),
  };
}

export function teveReuniao(l: LeadDoPeriodo) {
  return l.etapa === "agendado" || l.etapa === "no_show" || !!l.meeting_at;
}

export function montarRelatorio(input: {
  diario: LinhaMeta[];
  campanhas: CampanhaMeta[];
  leads: LeadDoPeriodo[];
}) {
  const porDia = new Map<string, { dia: string; gasto: number; leads: number }>();
  const porCampanha = new Map<string, Acumulado & { nome: string; id: string | null }>();
  const porAnuncio = new Map<
    string,
    Acumulado & { anuncio: string; conjunto: string | null; campanha: string }
  >();
  const campanhaDoAnuncio = new Map<string, string>();
  const total = vazio();

  for (const r of input.diario) {
    const campanha = r.campaign_name ?? "(sem campanha)";
    const d = porDia.get(r.dia) ?? { dia: r.dia, gasto: 0, leads: 0 };
    d.gasto += n(r.gasto);
    d.leads += n(r.leads);
    porDia.set(r.dia, d);
    const c = porCampanha.get(campanha) ?? { ...vazio(), nome: campanha, id: r.campaign_id };
    const chaveAd = `${campanha}|${r.ad_name ?? r.ad_id}`;
    const a = porAnuncio.get(chaveAd) ?? {
      ...vazio(),
      anuncio: r.ad_name ?? r.ad_id,
      conjunto: r.adset_name,
      campanha,
    };
    for (const alvo of [c, a, total]) {
      alvo.gasto += n(r.gasto);
      alvo.impressoes += n(r.impressoes);
      alvo.cliques += n(r.cliques);
      alvo.leads_meta += n(r.leads);
    }
    porCampanha.set(campanha, c);
    porAnuncio.set(chaveAd, a);
    if (r.ad_name) campanhaDoAnuncio.set(r.ad_name, campanha);
  }
  // Campanha ativa sem investimento no período também aparece.
  for (const c of input.campanhas) {
    if (c.status === "ACTIVE" && !porCampanha.has(c.nome))
      porCampanha.set(c.nome, { ...vazio(), nome: c.nome, id: c.campaign_id });
  }

  for (const l of input.leads) {
    const campanha =
      l.campaign && porCampanha.has(l.campaign)
        ? l.campaign
        : l.ad_name
          ? campanhaDoAnuncio.get(l.ad_name)
          : undefined;
    if (!campanha) continue;
    const c = porCampanha.get(campanha)!;
    const a = l.ad_name ? porAnuncio.get(`${campanha}|${l.ad_name}`) : undefined;
    for (const alvo of [c, a, total]) {
      if (!alvo) continue;
      alvo.leads_compass += 1;
      if (teveReuniao(l)) alvo.reunioes += 1;
      if (l.etapa === "desqualificado") alvo.descartados += 1;
    }
  }

  const info = new Map(input.campanhas.map((c) => [c.nome, c]));
  return {
    totais: fechar(total),
    dias: [...porDia.values()]
      .sort((a, b) => (a.dia < b.dia ? -1 : 1))
      .map((d) => ({ dia: d.dia, gasto: Math.round(d.gasto * 100) / 100, leads: d.leads })),
    campanhas: [...porCampanha.values()]
      .map((c) => {
        const i = info.get(c.nome);
        return {
          campanha: c.nome,
          status: i?.status ?? null,
          orcamento_diario: i?.orcamento_diario != null ? n(i.orcamento_diario) : null,
          orcamento_total: i?.orcamento_total != null ? n(i.orcamento_total) : null,
          alterada_em: i?.alterada_em ?? null,
          ...fechar(c),
        };
      })
      .sort((a, b) => b.gasto - a.gasto),
    anuncios: [...porAnuncio.values()]
      .map((a) => ({
        campanha: a.campanha,
        conjunto: a.conjunto,
        anuncio: a.anuncio,
        ...fechar(a),
      }))
      .sort((a, b) => b.gasto - a.gasto),
  };
}
