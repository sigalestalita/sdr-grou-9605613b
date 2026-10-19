-- Migração do RD, fase 1: histórico dos negócios.
--
-- Anotações e atividades de cada negócio do RD viram deal_activities. Para
-- rodar em fatias e poder parar e continuar:
--   * deal_activities.rd_activity_id guarda a origem, única: rodar de novo não
--     duplica;
--   * deals.rd_historico_em marca o negócio cujo histórico já foi buscado.

ALTER TABLE public.deal_activities ADD COLUMN IF NOT EXISTS rd_activity_id text;
-- Índice único inteiro (não parcial): o upsert do PostgREST (on_conflict)
-- só casa com ele. Nulos não colidem entre si.
CREATE UNIQUE INDEX IF NOT EXISTS deal_activities_rd_activity_key
  ON public.deal_activities (rd_activity_id);

ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS rd_historico_em timestamptz;
CREATE INDEX IF NOT EXISTS idx_deals_rd_historico_pendente
  ON public.deals (created_at) WHERE rd_deal_id IS NOT NULL AND rd_historico_em IS NULL;

COMMENT ON COLUMN public.deals.rd_historico_em IS
  'Quando as anotações/atividades do negócio no RD foram importadas (migração).';
