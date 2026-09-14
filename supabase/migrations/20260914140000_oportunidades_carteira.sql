-- Carteira: o CS sinaliza, o executivo abre o negócio.
--
-- A oportunidade na base nasce do lado do CS — é o analista que percebe que os
-- créditos acabaram ou que o cliente tem uma dor que outro produto resolve.
-- Mas quem abre e trabalha o negócio é o executivo de carteira, para o número
-- ficar com quem vende.
--
-- Sem isso a informação morria no CS: o analista via a oportunidade e não
-- tinha para onde mandar.
--
-- A regra de qual funil, que vem do desenho que já existe nos pipelines:
--   * recompra  -> UP SELL – Recompra. O cliente já usa e vai comprar mais do
--     mesmo. Funil curto (Selecionados, Proposta, Venda), porque não há o que
--     descobrir.
--   * cross_sell -> CROSS SELL – Cliente. Produto ou serviço que o cliente
--     ainda não tem. Funil longo, com agenda de identificação de necessidade e
--     pesquisa antes de virar oportunidade.
--   * renovacao -> renovação do contrato, os dois últimos meses da jornada
--     de CS. Entra no funil de recompra até existir um próprio.

CREATE TABLE IF NOT EXISTS public.cs_oportunidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uid text NOT NULL REFERENCES public.cs_clients(client_uid) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('recompra', 'cross_sell', 'renovacao')),
  -- o que o analista viu
  motivo text NOT NULL,
  produto_sugerido text,
  valor_estimado numeric(14,2),
  status text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'assumida', 'descartada')),
  sinalizada_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sinalizada_em timestamptz NOT NULL DEFAULT now(),
  -- quem assumiu e o negócio que nasceu dela
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

-- Os dois times enxergam: é justamente a ponte entre eles.
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

COMMENT ON TABLE public.cs_oportunidades IS
  'Sinalização do CS para o comercial. O analista sinaliza; o executivo de carteira abre o negócio e o número fica com quem vende.';
