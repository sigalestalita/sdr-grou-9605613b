/*
 * Relatório de campanhas da Meta × kanban do SDR. Lógica pura (testável):
 * recebe as linhas diárias da Meta, as campanhas e os envios de formulário
 * que chegaram ao Compass no período e devolve totais, série por dia e
 * tabelas por campanha e por anúncio.
 *
 * Envio = um lead da Meta (lead_id) que chegou ao Compass: o que criou o card
 * ou o que foi anexado como reconversão a um card que já existia (o RD criou
 * antes ou a pessoa já tinha convertido). Atribuição: pelo id da campanha;
 * sem ele, pelo nome da campanha; sem campanha da Meta (card do fluxo do RD),
 * pelo nome do anúncio.
 *
 * Campanha de contato (lead no site, webinar) não gera lead para o SDR: o que
 * a Meta conta nela vai para "contatos" e fica fora de leads, CPL e custo por
 * reunião.
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

export type EnvioCompass = {
  /** id do card no kanban */
  card: string;
  campaign_id: string | null;
  campanha: string | null;
  ad_id: string | null;
  ad_name: string | null;
  /** false quando o card já existia antes desse envio */
  novo: boolean;
  etapa: string | null;
  meeting_at: string | null;
};

export const ehCampanhaDeContato = (nome: string) => /lead-site|webinar/i.test(nome);

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const div = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) / 100 : null);

type Acumulado = {
  gasto: number;
  /** gasto das campanhas de lead (base do CPL e do custo por reunião) */
  gasto_leads: number;
  impressoes: number;
  cliques: number;
  leads_meta: number;
  contatos: number;
  leads_compass: number;
  ja_existiam: number;
  cardsReuniao: Set<string>;
  cardsDescartados: Set<string>;
};
const vazio = (): Acumulado => ({
  gasto: 0,
  gasto_leads: 0,
  impressoes: 0,
  cliques: 0,
  leads_meta: 0,
  contatos: 0,
  leads_compass: 0,
  ja_existiam: 0,
  cardsReuniao: new Set(),
  cardsDescartados: new Set(),
});

function fechar(a: Acumulado) {
  const reunioes = a.cardsReuniao.size;
  return {
    gasto: Math.round(a.gasto * 100) / 100,
    impressoes: a.impressoes,
    cliques: a.cliques,
    ctr: a.impressoes > 0 ? Math.round((a.cliques / a.impressoes) * 10000) / 100 : null,
    leads_meta: a.leads_meta,
    contatos: a.contatos,
    cpl: div(a.gasto_leads, a.leads_meta),
    leads_compass: a.leads_compass,
    ja_existiam: a.ja_existiam,
    reunioes,
    descartados: a.cardsDescartados.size,
    custo_reuniao: div(a.gasto_leads, reunioes),
  };
}

export function teveReuniao(l: { etapa: string | null; meeting_at: string | null }) {
  return l.etapa === "agendado" || l.etapa === "no_show" || !!l.meeting_at;
}

export function montarRelatorio(input: {
  diario: LinhaMeta[];
  campanhas: CampanhaMeta[];
  envios: EnvioCompass[];
}) {
  const porDia = new Map<string, { dia: string; gasto: number; leads: number }>();
  const porCampanha = new Map<
    string,
    Acumulado & { nome: string; id: string | null; contato: boolean }
  >();
  const porAnuncio = new Map<
    string,
    Acumulado & { anuncio: string; conjunto: string | null; campanha: string }
  >();
  const nomeDoId = new Map(input.campanhas.map((c) => [c.campaign_id, c.nome]));
  const campanhaDoAnuncio = new Map<string, string>();
  const chaveDoAdId = new Map<string, string>();
  const total = vazio();

  for (const r of input.diario) {
    const campanha = r.campaign_name ?? "(sem campanha)";
    const contato = ehCampanhaDeContato(campanha);
    if (r.campaign_id) nomeDoId.set(r.campaign_id, campanha);
    const d = porDia.get(r.dia) ?? { dia: r.dia, gasto: 0, leads: 0 };
    d.gasto += n(r.gasto);
    if (!contato) d.leads += n(r.leads);
    porDia.set(r.dia, d);
    const c = porCampanha.get(campanha) ?? {
      ...vazio(),
      nome: campanha,
      id: r.campaign_id,
      contato,
    };
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
      if (contato) alvo.contatos += n(r.leads);
      else {
        alvo.gasto_leads += n(r.gasto);
        alvo.leads_meta += n(r.leads);
      }
    }
    porCampanha.set(campanha, c);
    porAnuncio.set(chaveAd, a);
    if (r.ad_name) campanhaDoAnuncio.set(r.ad_name, campanha);
    chaveDoAdId.set(r.ad_id, chaveAd);
  }
  // Campanha ativa sem investimento no período também aparece.
  for (const c of input.campanhas) {
    if (c.status === "ACTIVE" && !porCampanha.has(c.nome))
      porCampanha.set(c.nome, {
        ...vazio(),
        nome: c.nome,
        id: c.campaign_id,
        contato: ehCampanhaDeContato(c.nome),
      });
  }

  for (const e of input.envios) {
    const pelaId = e.campaign_id ? nomeDoId.get(e.campaign_id) : undefined;
    const campanha =
      pelaId && porCampanha.has(pelaId)
        ? pelaId
        : e.campanha && porCampanha.has(e.campanha)
          ? e.campanha
          : e.ad_name
            ? campanhaDoAnuncio.get(e.ad_name)
            : undefined;
    if (!campanha) continue;
    const c = porCampanha.get(campanha)!;
    const chaveAd =
      (e.ad_id ? chaveDoAdId.get(e.ad_id) : undefined) ??
      (e.ad_name ? `${campanha}|${e.ad_name}` : undefined);
    const a = chaveAd ? porAnuncio.get(chaveAd) : undefined;
    for (const alvo of [c, a, total]) {
      if (!alvo) continue;
      alvo.leads_compass += 1;
      if (!e.novo) alvo.ja_existiam += 1;
      if (teveReuniao(e)) alvo.cardsReuniao.add(e.card);
      if (e.etapa === "desqualificado") alvo.cardsDescartados.add(e.card);
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
          contato: c.contato,
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
        contato: ehCampanhaDeContato(a.campanha),
        ...fechar(a),
      }))
      .sort((a, b) => b.gasto - a.gasto),
  };
}
