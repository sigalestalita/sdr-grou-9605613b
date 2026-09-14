ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS proximo_passo text;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS proximo_passo_em timestamptz;

COMMENT ON COLUMN public.deals.proximo_passo IS
  'O que o executivo combinou de fazer, e quando. É o que monta a fila do dia.';

CREATE INDEX IF NOT EXISTS idx_deals_proximo_passo
  ON public.deals (executivo_user_id, proximo_passo_em)
  WHERE status = 'open' AND proximo_passo_em IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.deal_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (
    tipo IN ('ligacao', 'email', 'reuniao', 'whatsapp', 'nota', 'proposta', 'etapa')
  ),
  descricao text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  de_stage_id uuid REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  para_stage_id uuid REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deal_activities_deal
  ON public.deal_activities (deal_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_deal_activities_autor
  ON public.deal_activities (author_id, occurred_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.deal_activities TO authenticated;
GRANT ALL ON public.deal_activities TO service_role;
ALTER TABLE public.deal_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deal_activities_read" ON public.deal_activities;
CREATE POLICY "deal_activities_read" ON public.deal_activities
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "deal_activities_write" ON public.deal_activities;
CREATE POLICY "deal_activities_write" ON public.deal_activities
  FOR INSERT TO authenticated
  WITH CHECK (public.is_manager(auth.uid()) OR public.has_team(auth.uid(), 'comercial'));

DROP POLICY IF EXISTS "deal_activities_update" ON public.deal_activities;
CREATE POLICY "deal_activities_update" ON public.deal_activities
  FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR public.is_manager(auth.uid()));

DROP POLICY IF EXISTS "deal_activities_delete" ON public.deal_activities;
CREATE POLICY "deal_activities_delete" ON public.deal_activities
  FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.is_manager(auth.uid()));

CREATE OR REPLACE FUNCTION public.deals_log_stage_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    INSERT INTO public.deal_activities (deal_id, tipo, descricao, author_id, de_stage_id, para_stage_id)
    VALUES (
      NEW.id,
      'etapa',
      NULL,
      auth.uid(),
      OLD.stage_id,
      NEW.stage_id
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.deals_log_stage_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS deals_log_stage_change ON public.deals;
CREATE TRIGGER deals_log_stage_change
  AFTER UPDATE OF stage_id ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.deals_log_stage_change();