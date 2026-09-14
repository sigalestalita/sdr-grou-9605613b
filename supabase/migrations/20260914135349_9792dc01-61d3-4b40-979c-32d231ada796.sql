CREATE TABLE IF NOT EXISTS public.cs_oportunidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uid text NOT NULL REFERENCES public.cs_clients(client_uid) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('recompra', 'cross_sell', 'renovacao')),
  motivo text NOT NULL,
  produto_sugerido text,
  valor_estimado numeric(14,2),
  status text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'assumida', 'descartada')),
  sinalizada_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sinalizada_em timestamptz NOT NULL DEFAULT now(),
  assumida_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assumida_em timestamptz,
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  descartada_motivo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cs_oportunidades_abertas
  ON public.cs_oportunidades (status, sinalizada_em DESC);
CREATE INDEX IF NOT EXISTS idx_cs_oportunidades_cliente
  ON public.cs_oportunidades (client_uid, sinalizada_em DESC);

GRANT SELECT, INSERT, UPDATE ON public.cs_oportunidades TO authenticated;
GRANT ALL ON public.cs_oportunidades TO service_role;
ALTER TABLE public.cs_oportunidades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cs_oportunidades_read" ON public.cs_oportunidades;
CREATE POLICY "cs_oportunidades_read" ON public.cs_oportunidades
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "cs_oportunidades_write" ON public.cs_oportunidades;
CREATE POLICY "cs_oportunidades_write" ON public.cs_oportunidades
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_manager(auth.uid())
    OR public.has_team(auth.uid(), 'cs')
    OR public.has_team(auth.uid(), 'comercial')
  );

DROP POLICY IF EXISTS "cs_oportunidades_update" ON public.cs_oportunidades;
CREATE POLICY "cs_oportunidades_update" ON public.cs_oportunidades
  FOR UPDATE TO authenticated
  USING (
    public.is_manager(auth.uid())
    OR public.has_team(auth.uid(), 'cs')
    OR public.has_team(auth.uid(), 'comercial')
  );

DROP TRIGGER IF EXISTS cs_oportunidades_touch ON public.cs_oportunidades;
CREATE TRIGGER cs_oportunidades_touch
  BEFORE UPDATE ON public.cs_oportunidades
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

COMMENT ON TABLE public.cs_oportunidades IS
  'Sinalização do CS para o comercial. O analista sinaliza; o executivo de carteira abre o negócio e o número fica com quem vende.';