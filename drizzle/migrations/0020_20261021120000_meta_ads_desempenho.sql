-- Desempenho das campanhas da Meta dentro do Compass.
--
-- O Make busca na Meta, todo dia, investimento, impressões, cliques e leads
-- por anúncio e manda para /api/public/hooks/meta-ads, que grava aqui. A
-- página Campanhas cruza isso com os leads do kanban (reuniões, descartes)
-- no período que a pessoa escolher.
CREATE TABLE IF NOT EXISTS public.meta_ads_diario (
  dia date NOT NULL,
  ad_id text NOT NULL,
  ad_name text,
  adset_id text,
  adset_name text,
  campaign_id text,
  campaign_name text,
  gasto numeric(12, 2) NOT NULL DEFAULT 0,
  impressoes bigint NOT NULL DEFAULT 0,
  cliques bigint NOT NULL DEFAULT 0,
  leads integer NOT NULL DEFAULT 0,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dia, ad_id)
);
CREATE INDEX IF NOT EXISTS meta_ads_diario_dia_idx ON public.meta_ads_diario (dia);
CREATE INDEX IF NOT EXISTS meta_ads_diario_campanha_idx ON public.meta_ads_diario (campaign_id, dia);

CREATE TABLE IF NOT EXISTS public.meta_ads_campanhas (
  campaign_id text PRIMARY KEY,
  nome text NOT NULL,
  objetivo text,
  status text,
  orcamento_diario numeric(12, 2),
  orcamento_total numeric(12, 2),
  criada_em timestamptz,
  alterada_em timestamptz,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.meta_ads_diario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meta_ads_campanhas ENABLE ROW LEVEL SECURITY;

-- Investimento é assunto de gestão: só gestores leem. A escrita é só do
-- servidor (cliente de serviço), por isso não há policy de escrita.
DROP POLICY IF EXISTS meta_ads_diario_gestores ON public.meta_ads_diario;
CREATE POLICY meta_ads_diario_gestores ON public.meta_ads_diario
  FOR SELECT TO authenticated USING (public.is_manager(auth.uid()));
DROP POLICY IF EXISTS meta_ads_campanhas_gestores ON public.meta_ads_campanhas;
CREATE POLICY meta_ads_campanhas_gestores ON public.meta_ads_campanhas
  FOR SELECT TO authenticated USING (public.is_manager(auth.uid()));
