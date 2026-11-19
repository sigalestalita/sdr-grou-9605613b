-- Reunião do financeiro (18/11): ficha confirmada pelo executivo e alerta de
-- cliente em atraso na empresa.

-- 1) O executivo confirma os dados da ficha e o vínculo com a empresa.
ALTER TABLE public.fichas_cadastrais
  ADD COLUMN IF NOT EXISTS confirmada_em timestamptz,
  ADD COLUMN IF NOT EXISTS confirmada_por uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2) Cliente em atraso: o executivo precisa ver mesmo sem ser dono do negócio
--    faturado (a nota em si continua visível só para ADM, gestão e o dono).
--    Devolve só o resumo: quantas parcelas, quanto e desde quando.
CREATE OR REPLACE FUNCTION public.empresa_em_atraso(_company uuid)
RETURNS TABLE (parcelas integer, valor numeric, mais_antiga date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT count(*)::int, COALESCE(sum(p.valor), 0), min(p.vencimento)
    FROM public.fatura_parcelas p
    JOIN public.faturas f ON f.id = p.fatura_id
    JOIN public.deals d ON d.id = f.deal_id
   WHERE d.company_id = _company
     AND f.status <> 'cancelada'
     AND p.pago_em IS NULL
     AND p.vencimento < (now() AT TIME ZONE 'America/Sao_Paulo')::date
     AND auth.uid() IS NOT NULL
$$;
REVOKE EXECUTE ON FUNCTION public.empresa_em_atraso(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.empresa_em_atraso(uuid) TO authenticated, service_role;
