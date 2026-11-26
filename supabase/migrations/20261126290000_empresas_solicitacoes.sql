-- Pedidos sobre empresas: quem não é gestão pede para mesclar, desativar
-- ("excluir") ou ligar filiais à empresa-mãe; a gestão aprova (e a ação é
-- executada) ou recusa. Excluir é desativar (ativo = false): some das listas,
-- mantém o histórico e pode ser reativada.
CREATE TABLE IF NOT EXISTS public.empresas_solicitacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('mesclar', 'excluir', 'filiais')),
  -- mesclar: a que fica; filiais: a mãe (null = criar nova_mae_nome)
  fica_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  fica_nome text,
  nova_mae_nome text,
  -- mesclar: as que saem; excluir: as que serão desativadas; filiais: as filhas
  alvo_ids uuid[] NOT NULL,
  alvo_nomes text[] NOT NULL DEFAULT '{}',
  grupo text,
  motivo text NOT NULL,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovada', 'recusada')),
  solicitado_por uuid NOT NULL DEFAULT auth.uid(),
  solicitado_em timestamptz NOT NULL DEFAULT now(),
  decidido_por uuid,
  decidido_em timestamptz,
  observacao text,
  resultado jsonb
);
CREATE INDEX IF NOT EXISTS empresas_solicitacoes_status_idx
  ON public.empresas_solicitacoes (status, solicitado_em DESC);

ALTER TABLE public.empresas_solicitacoes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.empresas_solicitacoes TO authenticated;
GRANT ALL ON public.empresas_solicitacoes TO service_role;
DROP POLICY IF EXISTS empresas_solicitacoes_ler ON public.empresas_solicitacoes;
CREATE POLICY empresas_solicitacoes_ler ON public.empresas_solicitacoes
  FOR SELECT TO authenticated
  USING (solicitado_por = auth.uid() OR public.is_manager(auth.uid()));
DROP POLICY IF EXISTS empresas_solicitacoes_pedir ON public.empresas_solicitacoes;
CREATE POLICY empresas_solicitacoes_pedir ON public.empresas_solicitacoes
  FOR INSERT TO authenticated
  WITH CHECK (solicitado_por = auth.uid() AND status = 'pendente' AND decidido_por IS NULL);
DROP POLICY IF EXISTS empresas_solicitacoes_decidir ON public.empresas_solicitacoes;
CREATE POLICY empresas_solicitacoes_decidir ON public.empresas_solicitacoes
  FOR UPDATE TO authenticated
  USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

/* Desativar / reativar empresa (o "excluir"): só a gestão. */
CREATE OR REPLACE FUNCTION public.desativar_empresas(_ids uuid[], _ativo boolean DEFAULT false)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE n integer;
BEGIN
  IF NOT public.is_manager(auth.uid()) AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Só a gestão desativa empresas';
  END IF;
  UPDATE companies SET ativo = _ativo, updated_at = now() WHERE id = ANY(_ids);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.desativar_empresas(uuid[], boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.desativar_empresas(uuid[], boolean) TO authenticated, service_role;

/* Quem é da gestão (para avisar dos pedidos). Só ids: quem decide não é segredo. */
CREATE OR REPLACE FUNCTION public.ids_da_gestao()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT ur.user_id FROM user_roles ur
  WHERE ur.role::text IN ('super_admin', 'gestao') AND auth.uid() IS NOT NULL
$$;
REVOKE ALL ON FUNCTION public.ids_da_gestao() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ids_da_gestao() TO authenticated, service_role;

/* A lista de parecidas passa a abrir para CS e comercial (eles pedem; a gestão decide). */
CREATE OR REPLACE FUNCTION public.empresas_parecidas(_limite integer DEFAULT 300)
RETURNS TABLE (
  grupo text, motivo text, id uuid, uid text, nome text, cnpj text, dominio text,
  cidade text, estado text, rd_org_id text, cliente boolean,
  contatos bigint, leads bigint, negocios bigint, criado_em timestamptz,
  mae_id uuid, mae_nome text, filiais bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Ver a lista: gestão, CS e comercial (quem não é gestão só pede a mescla).
  IF NOT (public.is_manager(auth.uid()) OR public.has_team(auth.uid(), 'cs')
          OR public.has_team(auth.uid(), 'comercial'))
     AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Sem acesso à lista de empresas parecidas';
  END IF;
  RETURN QUERY
  WITH base AS (
    SELECT c.*, public.empresa_chave(c.nome) AS chave,
           nullif(regexp_replace(coalesce(c.cnpj, ''), '\D', '', 'g'), '') AS cnpj_d,
           nullif(lower(trim(coalesce(c.dominio, ''))), '') AS dom
    FROM companies c WHERE c.ativo
  ),
  grupos AS (
    SELECT 'cnpj:' || cnpj_d AS g, 'Mesmo CNPJ' AS m, b.id FROM base b
     WHERE length(cnpj_d) = 14 AND cnpj_d IN (
       SELECT cnpj_d FROM base WHERE length(cnpj_d) = 14 GROUP BY 1 HAVING count(*) > 1)
    UNION
    SELECT 'dominio:' || dom, 'Mesmo domínio', b.id FROM base b
     WHERE dom IS NOT NULL AND dom IN (
       SELECT dom FROM base WHERE dom IS NOT NULL GROUP BY 1 HAVING count(*) > 1)
    UNION
    SELECT 'nome:' || chave, 'Nome parecido', b.id FROM base b
     WHERE length(chave) >= 3 AND chave IN (
       SELECT chave FROM base WHERE length(chave) >= 3 GROUP BY 1 HAVING count(*) > 1)
  ),
  -- Já organizados: todas sob a mesma mãe (ou a mãe e as filhas dela).
  organizados AS (
    SELECT gr.g FROM grupos gr JOIN base b ON b.id = gr.id
    GROUP BY gr.g HAVING count(DISTINCT coalesce(b.parent_company_id, b.id)) = 1
  ),
  escolhidos AS (
    SELECT g FROM grupos
    WHERE g NOT IN (SELECT i.grupo FROM empresas_grupos_ignorados i WHERE i.decisao = 'diferentes')
      AND g NOT IN (SELECT o.g FROM organizados o)
    GROUP BY g
    ORDER BY min(CASE WHEN g LIKE 'cnpj:%' THEN 0 WHEN g LIKE 'dominio:%' THEN 1 ELSE 2 END), g
    LIMIT _limite
  )
  SELECT gr.g, gr.m, b.id, b.uid, b.nome, b.cnpj, b.dominio, b.cidade, b.estado, b.rd_org_id,
         EXISTS (SELECT 1 FROM cs_clients k WHERE k.company_id = b.id AND k.ativo),
         (SELECT count(*) FROM contacts ct WHERE ct.company_id = b.id),
         (SELECT count(*) FROM leads l WHERE l.company_id = b.id),
         (SELECT count(*) FROM deals d WHERE d.company_id = b.id),
         b.created_at,
         b.parent_company_id,
         (SELECT p.nome FROM companies p WHERE p.id = b.parent_company_id),
         (SELECT count(*) FROM companies f WHERE f.parent_company_id = b.id)
  FROM grupos gr JOIN escolhidos e ON e.g = gr.g JOIN base b ON b.id = gr.id
  ORDER BY gr.g, b.created_at;
END $$;
REVOKE ALL ON FUNCTION public.empresas_parecidas(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.empresas_parecidas(integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
