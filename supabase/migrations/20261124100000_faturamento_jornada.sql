-- Jornada do faturamento (mockups de 23/11): um negócio faturado em vários
-- CNPJs da mesma conta-mãe, e o histórico de notas da empresa no negócio.

-- 1) Rateio do negócio por CNPJ. O executivo vende um valor único (comissão);
--    cada linha é uma empresa filha da conta-mãe e vira uma venda/nota na
--    Conta Azul. A leitura da Conta Azul preenche as colunas ca_* por linha.
CREATE TABLE IF NOT EXISTS public.deal_faturamento_cnpjs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  cnpj text NOT NULL CHECK (cnpj ~ '^[0-9]{14}$'),
  valor numeric(14,2) NOT NULL CHECK (valor > 0),
  ca_venda_id text,
  ca_venda_numero integer,
  ca_situacao text,
  ca_nf_status text,
  ca_nf_numeros text,
  ca_valor_faturado numeric(14,2),
  ca_sincronizado_em timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deal_id, cnpj)
);
CREATE INDEX IF NOT EXISTS deal_fat_cnpjs_deal_idx ON public.deal_faturamento_cnpjs (deal_id);
ALTER TABLE public.deal_faturamento_cnpjs ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.deal_faturamento_cnpjs TO authenticated;
GRANT ALL ON public.deal_faturamento_cnpjs TO service_role;
-- Vê quem vê o negócio (a RLS de deals vale dentro do EXISTS). Escrita só
-- pelo servidor, depois de conferir que é o executivo do negócio ou o ADM.
DROP POLICY IF EXISTS deal_fat_cnpjs_read ON public.deal_faturamento_cnpjs;
CREATE POLICY deal_fat_cnpjs_read ON public.deal_faturamento_cnpjs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_id));

-- 2) Notas já emitidas para a empresa (Compass + Conta Azul), para o
--    executivo ver o histórico ao vender de novo. Só o resumo de cada nota.
CREATE OR REPLACE FUNCTION public.notas_da_empresa(_company uuid)
RETURNS TABLE (origem text, numero text, emitida_em date, valor numeric, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT * FROM (
    SELECT 'conta_azul'::text, n.numero_nfse, n.data_competencia, n.valor, n.status
      FROM public.ca_notas n
     WHERE n.company_id = _company
    UNION ALL
    SELECT 'compass'::text, f.numero_nf, f.emitida_em::date, f.valor_bruto, f.status
      FROM public.faturas f
      JOIN public.deals d ON d.id = f.deal_id
     WHERE d.company_id = _company
  ) x
  WHERE auth.uid() IS NOT NULL
  ORDER BY 3 DESC NULLS LAST
  LIMIT 20
$$;
REVOKE EXECUTE ON FUNCTION public.notas_da_empresa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notas_da_empresa(uuid) TO authenticated, service_role;
