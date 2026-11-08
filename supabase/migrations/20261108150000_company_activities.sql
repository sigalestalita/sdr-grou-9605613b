-- Anotações e tarefas do RD de cards que não viram negócio nem lead (funis
-- de CS, parceiros, repescagem, carteira): ficam na empresa do card e
-- aparecem na linha do tempo dela.
CREATE TABLE IF NOT EXISTS public.company_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  descricao text,
  occurred_at timestamptz NOT NULL,
  author_id uuid,
  rd_autor text,
  rd_funil text,
  rd_activity_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS company_activities_company_idx
  ON public.company_activities (company_id, occurred_at DESC);
ALTER TABLE public.company_activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_activities_read ON public.company_activities;
CREATE POLICY company_activities_read ON public.company_activities
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
