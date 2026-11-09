-- Relatórios personalizados salvos. Cada um é de quem criou; quem marcar
-- "compartilhar" deixa todos verem. Os dados mostrados sempre respeitam o
-- acesso de quem abre (o relatório guarda só a definição, não os números).
CREATE TABLE IF NOT EXISTS public.relatorios_salvos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL CHECK (char_length(nome) BETWEEN 1 AND 160),
  pergunta text CHECK (char_length(pergunta) <= 1000),
  spec jsonb NOT NULL,
  compartilhado boolean NOT NULL DEFAULT false,
  criado_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS relatorios_salvos_dono ON public.relatorios_salvos (criado_por);

ALTER TABLE public.relatorios_salvos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rs_ler ON public.relatorios_salvos;
CREATE POLICY rs_ler ON public.relatorios_salvos FOR SELECT TO authenticated
  USING (criado_por = auth.uid() OR compartilhado);
DROP POLICY IF EXISTS rs_criar ON public.relatorios_salvos;
CREATE POLICY rs_criar ON public.relatorios_salvos FOR INSERT TO authenticated
  WITH CHECK (criado_por = auth.uid());
DROP POLICY IF EXISTS rs_editar ON public.relatorios_salvos;
CREATE POLICY rs_editar ON public.relatorios_salvos FOR UPDATE TO authenticated
  USING (criado_por = auth.uid()) WITH CHECK (criado_por = auth.uid());
DROP POLICY IF EXISTS rs_apagar ON public.relatorios_salvos;
CREATE POLICY rs_apagar ON public.relatorios_salvos FOR DELETE TO authenticated
  USING (criado_por = auth.uid() OR public.is_manager(auth.uid()));
