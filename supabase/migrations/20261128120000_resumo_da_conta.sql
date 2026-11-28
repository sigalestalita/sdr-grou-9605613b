-- Resumo da conta por time.
-- 1) resumos_conta: o resumo em texto (IA) de cada empresa, guardado para não gerar a cada visita.
--    Qualquer pessoa logada lê (decisão da gestão: o resumo da conta é de todos os times).
CREATE TABLE IF NOT EXISTS public.resumos_conta (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  texto text NOT NULL,
  gerado_em timestamptz NOT NULL DEFAULT now(),
  gerado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  modelo text
);
ALTER TABLE public.resumos_conta ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS resumos_conta_leitura ON public.resumos_conta;
CREATE POLICY resumos_conta_leitura ON public.resumos_conta FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.resumos_conta TO authenticated;
GRANT ALL ON public.resumos_conta TO service_role;

-- 2) alertas_das_contas(): o que pede ação em cada empresa, por time, para o Início da gestão.
--    Mesmas regras dos cartões (src/lib/empresa/resumo-por-time.ts). A sinaleira fica só no
--    cartão do CS: são centenas de contas em vermelho/preto e afogaria a lista.
CREATE OR REPLACE FUNCTION public.alertas_das_contas()
RETURNS TABLE (company_id uuid, empresa text, area text, alerta text, qtd bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_manager(auth.uid()) AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
    RAISE EXCEPTION 'só a gestão';
  END IF;
  RETURN QUERY
  WITH a AS (
    SELECT l.company_id, 'sdr'::text AS area, 'Follow-up vencido há mais de 3 dias'::text AS alerta, count(*) AS qtd
    FROM leads l
    WHERE l.company_id IS NOT NULL AND NOT l.exemplo AND l.next_follow_up_at < now() - interval '3 days'
    GROUP BY 1
    UNION ALL
    SELECT p.company_id, 'comercial', 'Proposta sem resposta há mais de 7 dias', count(*)
    FROM propostas p
    WHERE p.company_id IS NOT NULL AND p.status IN ('enviada', 'visualizada') AND p.enviada_em < now() - interval '7 days'
    GROUP BY 1
    UNION ALL
    SELECT c.company_id, 'cs', 'Ticket aberto', count(*)
    FROM cs_tickets t JOIN cs_clients c ON c.client_uid = t.client_uid
    WHERE c.company_id IS NOT NULL AND t.status IN ('aberto', 'em_andamento')
    GROUP BY 1
    UNION ALL
    SELECT c.company_id, 'cs', 'Tarefa do CS atrasada', count(*)
    FROM cs_tasks k JOIN cs_clients c ON c.client_uid = k.client_uid
    WHERE c.company_id IS NOT NULL AND k.status = 'pendente' AND k.due_at < now()
    GROUP BY 1
    UNION ALL
    SELECT c.company_id, 'cs', 'Renovação em até 30 dias', count(*)
    FROM cs_clients c
    WHERE c.company_id IS NOT NULL AND c.ativo AND c.mesclado_em IS NULL AND NOT c.exemplo
      AND c.data_renovacao BETWEEN current_date AND current_date + 30
    GROUP BY 1
    UNION ALL
    SELECT f.company_id, 'adm', 'Parcela vencida', count(*)
    FROM fatura_parcelas pa JOIN faturas f ON f.id = pa.fatura_id
    WHERE f.company_id IS NOT NULL AND f.status <> 'cancelada' AND pa.pago_em IS NULL AND pa.vencimento < current_date
    GROUP BY 1
    UNION ALL
    SELECT fc.company_id, 'adm', 'Ficha cadastral esperando conferência', count(*)
    FROM fichas_cadastrais fc
    -- As do CSV são o histórico importado, que nunca passou pela conferência do Compass.
    WHERE fc.company_id IS NOT NULL AND fc.enviada_em IS NOT NULL AND fc.confirmada_em IS NULL
      AND coalesce(fc.origem, '') <> 'csv'
    GROUP BY 1
    UNION ALL
    SELECT r.company_id, 'trainers', 'Sessão passada sem registro', count(*)
    FROM requerimento_sessoes s JOIN requerimentos r ON r.id = s.requerimento_id
    WHERE r.company_id IS NOT NULL AND s.data < current_date AND s.status IN ('a_confirmar', 'confirmado')
    GROUP BY 1
  )
  SELECT a.company_id, co.nome, a.area, a.alerta, a.qtd
  FROM a JOIN companies co ON co.id = a.company_id
  ORDER BY co.nome, a.area;
END $$;
REVOKE ALL ON FUNCTION public.alertas_das_contas() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.alertas_das_contas() TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
