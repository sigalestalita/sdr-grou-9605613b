-- Módulo Comercial — metas, corte de fechamento e esteira entre áreas.
--
-- Vem do briefing com a gestora comercial. O esquema de negócios já existia
-- (companies, deals, pipelines, pipeline_stages), alimentado pela migração do
-- RD, mas sem nenhuma tela e sem três coisas que ela pediu de forma explícita:
--
--   1. Meta por pessoa, com valor E quantidade, e as micrometas de atividade
--      que compõem a meta. Sem isso "a gente não tem com o que comparar".
--      Exemplo dado: meta de R$ 50 mil se fecha com 2 negócios grandes, mas a
--      empresa precisa de 12 vendas, porque o ticket médio é R$ 4,5 mil.
--   2. Corte de fechamento. Hoje o comercial dá ganho no aceite da proposta,
--      mas venda ganha de verdade é a ORDEM DE COMPRA. Por isso a gestora e o
--      financeiro chegam a números diferentes.
--   3. Esteira do cliente entre áreas: comercial -> faturamento (ADM) -> CS.
--      Quem dá o check é o ADM, e o bastão passa pelo CRM, não por conversa.

-- ---------------------------------------------------------------------------
-- 1. Metas comerciais
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.commercial_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- primeiro dia do mês da meta
  periodo date NOT NULL,
  -- carteira (renovação/recompra da base) ou novos negócios
  escopo text NOT NULL DEFAULT 'novos' CHECK (escopo IN ('novos', 'carteira', 'ambos')),
  -- pipeline específico, ou NULL para a meta geral da pessoa
  pipeline_id uuid REFERENCES public.pipelines(id) ON DELETE SET NULL,
  meta_valor numeric(14,2) NOT NULL DEFAULT 0,
  meta_quantidade integer NOT NULL DEFAULT 0,
  -- micrometas de atividade: o que precisa acontecer para a meta fechar
  meta_agendas integer,
  meta_propostas integer,
  meta_contatos integer,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (user_id, periodo, escopo, pipeline_id)
);
CREATE INDEX IF NOT EXISTS idx_commercial_goals_periodo
  ON public.commercial_goals (periodo DESC, user_id);

GRANT SELECT ON public.commercial_goals TO authenticated;
GRANT ALL ON public.commercial_goals TO service_role;
ALTER TABLE public.commercial_goals ENABLE ROW LEVEL SECURITY;

-- Gestão à vista: todo mundo enxerga as metas, quem edita é a gestão.
DROP POLICY IF EXISTS "commercial_goals_read" ON public.commercial_goals;
CREATE POLICY "commercial_goals_read" ON public.commercial_goals
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "commercial_goals_write" ON public.commercial_goals;
CREATE POLICY "commercial_goals_write" ON public.commercial_goals
  FOR ALL TO authenticated
  USING (public.is_manager(auth.uid()))
  WITH CHECK (public.is_manager(auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. Corte de fechamento: proposta aceita não é venda ganha
-- ---------------------------------------------------------------------------
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS proposta_aceita_em timestamptz;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS ordem_compra_em timestamptz;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS ordem_compra_numero text;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS contrato_assinado_em timestamptz;
-- data em que o ADM validou e liberou para faturamento/CS
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS adm_checked_at timestamptz;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS adm_checked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS faturado_em timestamptz;
-- quando o cliente foi entregue ao CS
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS cs_entregue_em timestamptz;

COMMENT ON COLUMN public.deals.ordem_compra_em IS
  'Data da ordem de compra. É esta data, e não o aceite da proposta, que caracteriza venda ganha para a meta.';

/**
 * Vale para a meta? Só conta o negócio cujo dinheiro de fato entra:
 * ganho E com ordem de compra registrada. Quando a base antiga não tem a data
 * da OC, cai no closed_at para não zerar o histórico do RD.
 */
CREATE OR REPLACE FUNCTION public.deal_data_ganho(_deal public.deals)
RETURNS timestamptz
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN _deal.status <> 'won' THEN NULL
    ELSE COALESCE(_deal.ordem_compra_em, _deal.closed_at)
  END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Esteira do cliente entre as áreas
-- ---------------------------------------------------------------------------
-- Onde o cliente está depois que o comercial fecha. O ADM é quem dá o check.
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS esteira text
  NOT NULL DEFAULT 'comercial'
  CHECK (esteira IN ('comercial', 'faturamento', 'cs', 'concluido'));

COMMENT ON COLUMN public.deals.esteira IS
  'Etapa do cliente entre áreas: comercial -> faturamento (ADM valida) -> cs -> concluido.';

/** Move a esteira sozinha conforme as datas vão sendo preenchidas. */
CREATE OR REPLACE FUNCTION public.deals_sync_esteira()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.cs_entregue_em IS NOT NULL THEN
    NEW.esteira := 'cs';
  ELSIF NEW.faturado_em IS NOT NULL OR NEW.adm_checked_at IS NOT NULL THEN
    NEW.esteira := 'faturamento';
  ELSIF NEW.status = 'won' AND NEW.ordem_compra_em IS NOT NULL THEN
    NEW.esteira := 'faturamento';
  ELSE
    NEW.esteira := 'comercial';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS deals_sync_esteira ON public.deals;
CREATE TRIGGER deals_sync_esteira
  BEFORE INSERT OR UPDATE OF status, ordem_compra_em, adm_checked_at, faturado_em, cs_entregue_em
  ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.deals_sync_esteira();

-- ---------------------------------------------------------------------------
-- 4. Configuração do módulo (ticket médio, SLAs entre áreas)
-- ---------------------------------------------------------------------------
INSERT INTO public.app_settings (key, value)
SELECT 'comercial', jsonb_build_object(
  -- usado para sugerir a meta de quantidade a partir da meta de valor
  'ticket_medio', 4500,
  -- SLAs entre áreas, em dias, que ela quer desenhar com o ADM e o CS
  'sla_oc_para_faturamento_dias', 5,
  'sla_faturamento_para_cs_dias', 5,
  'sla_cs_primeira_agenda_dias', 7,
  -- jornada do CS: 2 meses de onboarding, 8 de atendimento, 2 comerciais
  'jornada_cs_meses', 10,
  'jornada_cs_onboarding_meses', 2,
  'jornada_cs_comercial_meses', 2,
  'renovacao_antecedencia_dias', 60
)
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'comercial');
