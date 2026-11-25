-- Reengajamento: uma campanha que vai para quem recebeu outra campanha e não
-- abriu (ou não clicou) até uma data. Em vez de uma segmentação, a lista vem
-- dos envios da campanha de origem.

ALTER TABLE public.email_campanhas
  ADD COLUMN IF NOT EXISTS origem_campanha_id uuid REFERENCES public.email_campanhas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reengajar text CHECK (reengajar IN ('nao_abriu', 'nao_clicou')),
  ADD COLUMN IF NOT EXISTS reengajar_ate timestamptz;

/*
 * Quem recebeu a campanha de origem (enviado até a data de corte) e não
 * abriu / não clicou até essa data. Descadastrados ficam de fora. A data de
 * corte nunca passa de agora: um corte no futuro vale como "até o envio".
 */
CREATE OR REPLACE FUNCTION public.email_reengajamento(origem uuid, criterio text, ate timestamptz DEFAULT NULL)
RETURNS TABLE (lead_id uuid, email text, nome text, empresa text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH corte AS (SELECT least(coalesce(ate, now()), now()) AS t)
  SELECT e.lead_id, e.email, e.nome, e.empresa
    FROM public.email_envios e, corte
   WHERE e.campanha_id = origem
     AND e.status = 'enviado'
     AND e.enviado_em <= corte.t
     AND e.descadastrou_em IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.email_descadastros d WHERE lower(d.email) = lower(e.email))
     AND CASE criterio
           WHEN 'nao_abriu' THEN e.aberto_em IS NULL OR e.aberto_em > corte.t
           WHEN 'nao_clicou' THEN e.clicado_em IS NULL OR e.clicado_em > corte.t
           ELSE false
         END
   ORDER BY e.email
$$;
REVOKE EXECUTE ON FUNCTION public.email_reengajamento(uuid, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.email_reengajamento(uuid, text, timestamptz) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.email_reengajamento_contagem(origem uuid, criterio text, ate timestamptz DEFAULT NULL)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT count(*)::int FROM public.email_reengajamento(origem, criterio, ate)
$$;
REVOKE EXECUTE ON FUNCTION public.email_reengajamento_contagem(uuid, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.email_reengajamento_contagem(uuid, text, timestamptz) TO authenticated, service_role;
