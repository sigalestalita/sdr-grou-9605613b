import { describe, expect, it, vi } from "vitest";
import { montarRelatorio, type EnvioCompass } from "./meta-ads-relatorio";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: {} }));
const { linhaDiaria, linhaCampanha } = await import("./meta-ads.server");

const linha = (dia: string, ad: string, campanha: string, gasto: number, leads: number) => ({
  dia,
  ad_id: ad,
  ad_name: ad,
  adset_name: "conj",
  campaign_id: campanha,
  campaign_name: campanha,
  gasto,
  impressoes: 1000,
  cliques: 10,
  leads,
});

describe("relatório de campanhas da Meta", () => {
  it("soma por dia, campanha e anúncio e cruza com os envios do kanban", () => {
    const envio = (o: Partial<EnvioCompass> & { card: string }): EnvioCompass => ({
      campaign_id: null,
      campanha: null,
      ad_id: null,
      ad_name: null,
      novo: true,
      etapa: "novo",
      meeting_at: null,
      ...o,
    });
    const r = montarRelatorio({
      diario: [
        linha("2026-10-19", "ad1", "sicredi", 100, 4),
        linha("2026-10-20", "ad1", "sicredi", 300, 5),
        linha("2026-10-20", "ad2", "disc", 50, 0),
        linha("2026-10-20", "ad3", "produto_pda_mf_lead-site_webinar_discxpda", 50, 37),
      ],
      campanhas: [
        {
          campaign_id: "x",
          nome: "parada",
          status: "PAUSED",
          orcamento_diario: null,
          orcamento_total: null,
          alterada_em: null,
        },
        {
          campaign_id: "y",
          nome: "nova",
          status: "ACTIVE",
          orcamento_diario: 150,
          orcamento_total: null,
          alterada_em: null,
        },
      ],
      envios: [
        // Pelo id da campanha, mesmo com o nome do fluxo do RD no card.
        envio({ card: "c1", campaign_id: "sicredi", campanha: "Fluxo do RD", etapa: "agendado" }),
        // Reconversão anexada ao mesmo card: conta o envio, não repete a reunião.
        envio({ card: "c1", campanha: "sicredi", novo: false, etapa: "agendado" }),
        // Card do RD sem campanha da Meta: o anúncio liga à campanha.
        envio({ card: "c2", campanha: "Fluxo do RD", ad_name: "ad1", etapa: "desqualificado" }),
        envio({ card: "c3", campanha: "disc", meeting_at: "2026-10-22T10:00:00Z" }),
        envio({ card: "c4", campanha: "outra" }),
      ],
    });
    expect(r.dias).toEqual([
      { dia: "2026-10-19", gasto: 100, leads: 4 },
      { dia: "2026-10-20", gasto: 400, leads: 5 },
    ]);
    expect(r.totais).toMatchObject({
      gasto: 500,
      leads_meta: 9,
      contatos: 37,
      leads_compass: 4,
      ja_existiam: 1,
      reunioes: 2,
      cpl: 50,
      custo_reuniao: 225,
    });
    const sic = r.campanhas.find((c) => c.campanha === "sicredi")!;
    expect(sic).toMatchObject({
      gasto: 400,
      leads_meta: 9,
      leads_compass: 3,
      reunioes: 1,
      descartados: 1,
      custo_reuniao: 400,
    });
    expect(r.campanhas.find((c) => c.campanha.includes("webinar"))).toMatchObject({
      contato: true,
      leads_meta: 0,
      contatos: 37,
      cpl: null,
    });
    expect(r.campanhas.find((c) => c.campanha === "nova")).toMatchObject({
      gasto: 0,
      orcamento_diario: 150,
    });
    expect(r.campanhas.find((c) => c.campanha === "parada")).toBeUndefined();
    expect(r.anuncios[0]).toMatchObject({ anuncio: "ad1", gasto: 400, leads_compass: 1 });
  });

  it("traduz o que a Meta manda pelo Make", () => {
    expect(
      linhaDiaria({
        date_start: "2026-10-20",
        ad_id: "1",
        campaign_name: "c",
        spend: "12.5",
        impressions: "100",
        clicks: "3",
        actions: [
          { action_type: "link_click", value: "3" },
          { action_type: "lead", value: "2" },
        ],
      }),
    ).toMatchObject({ dia: "2026-10-20", gasto: 12.5, impressoes: 100, cliques: 3, leads: 2 });
    expect(linhaDiaria({ date_start: "x", ad_id: "1" })).toBeNull();
    expect(linhaCampanha({ id: "9", name: "c", daily_budget: "48077" })).toMatchObject({
      orcamento_diario: 480.77,
      orcamento_total: null,
    });
  });
});
