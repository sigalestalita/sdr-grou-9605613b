-- Etapas ocultas nos kanbans (SDR, pipeline de negócios, carteira, CS).
-- Cada pessoa esconde as colunas que não quer ver (user_id = ela); a gestão
-- pode esconder para todos (user_id nulo). Vale a escolha da pessoa; sem
-- escolha própria, vale a da gestão.
CREATE TABLE IF NOT EXISTS public.kanban_etapas_ocultas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quadro text NOT NULL CHECK (char_length(quadro) BETWEEN 1 AND 120),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  etapas text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS kanban_etapas_ocultas_pessoa
  ON public.kanban_etapas_ocultas (quadro, user_id) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS kanban_etapas_ocultas_todos
  ON public.kanban_etapas_ocultas (quadro) WHERE user_id IS NULL;

ALTER TABLE public.kanban_etapas_ocultas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS keo_read ON public.kanban_etapas_ocultas;
CREATE POLICY keo_read ON public.kanban_etapas_ocultas FOR SELECT TO authenticated
  USING (user_id IS NULL OR user_id = auth.uid());
DROP POLICY IF EXISTS keo_insert ON public.kanban_etapas_ocultas;
CREATE POLICY keo_insert ON public.kanban_etapas_ocultas FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR (user_id IS NULL AND public.is_manager(auth.uid())));
DROP POLICY IF EXISTS keo_update ON public.kanban_etapas_ocultas;
CREATE POLICY keo_update ON public.kanban_etapas_ocultas FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR (user_id IS NULL AND public.is_manager(auth.uid())))
  WITH CHECK (user_id = auth.uid() OR (user_id IS NULL AND public.is_manager(auth.uid())));
DROP POLICY IF EXISTS keo_delete ON public.kanban_etapas_ocultas;
CREATE POLICY keo_delete ON public.kanban_etapas_ocultas FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR (user_id IS NULL AND public.is_manager(auth.uid())));
