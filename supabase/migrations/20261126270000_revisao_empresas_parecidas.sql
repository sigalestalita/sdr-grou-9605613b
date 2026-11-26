-- Revisão da gestão sobre empresas parecidas: cada grupo recebe uma decisão
-- (mesclar, são filiais de uma empresa-mãe, ou não são a mesma), com quem e
-- quando. Filiais (Sicredi, Gerdau, Ambev…) não são mescladas: ficam ligadas
-- à mãe por companies.parent_company_id, e um grupo cujas empresas já estão
-- todas sob a mesma mãe deixa de aparecer (uma unidade nova sem mãe faz o
-- grupo voltar).
ALTER TABLE public.empresas_grupos_ignorados
  ADD COLUMN IF NOT EXISTS decisao text NOT NULL DEFAULT 'diferentes'
    CHECK (decisao IN ('diferentes', 'filiais')),
  ADD COLUMN IF NOT EXISTS mae_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS filhas uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS observacao text;

DROP FUNCTION IF EXISTS public.empresas_parecidas(integer);
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
  IF NOT public.is_manager(auth.uid()) AND current_user NOT IN ('postgres', 'service_role') THEN
    RAISE EXCEPTION 'Só a gestão mescla empresas';
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

/*
 * Liga as filhas à empresa-mãe (sem mesclar) e registra a decisão do grupo.
 * A mãe não pode estar entre as filhas nem ser filha de uma delas.
 */
CREATE OR REPLACE FUNCTION public.ligar_filiais(_mae uuid, _filhas uuid[], _grupo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  n integer;
BEGIN
  IF NOT public.is_manager(auth.uid()) AND current_user NOT IN ('postgres', 'service_role') THEN
    RAISE EXCEPTION 'Só a gestão organiza filiais';
  END IF;
  IF _mae = ANY(_filhas) THEN RAISE EXCEPTION 'A empresa-mãe não pode ser filial dela mesma'; END IF;
  IF EXISTS (SELECT 1 FROM companies WHERE id = _mae AND parent_company_id = ANY(_filhas)) THEN
    RAISE EXCEPTION 'A empresa-mãe escolhida é filial de uma das selecionadas';
  END IF;
  UPDATE companies SET parent_company_id = _mae, updated_at = now()
   WHERE id = ANY(_filhas) AND id <> _mae;
  GET DIAGNOSTICS n = ROW_COUNT;
  -- No CS, a filial cliente passa a aparecer em "Empresas atendidas" da mãe cliente.
  UPDATE cs_clients f SET parent_client_uid = m.client_uid
    FROM (SELECT client_uid FROM cs_clients WHERE company_id = _mae ORDER BY ativo DESC LIMIT 1) m
   WHERE f.company_id = ANY(_filhas) AND f.parent_client_uid IS NULL AND f.client_uid <> m.client_uid;
  INSERT INTO empresas_grupos_ignorados (grupo, decisao, mae_id, filhas, ignorado_por, ignorado_em)
  VALUES (_grupo, 'filiais', _mae, _filhas, auth.uid(), now())
  ON CONFLICT (grupo) DO UPDATE SET decisao = 'filiais', mae_id = EXCLUDED.mae_id,
    filhas = (SELECT array_agg(DISTINCT x) FROM unnest(empresas_grupos_ignorados.filhas || EXCLUDED.filhas) x),
    ignorado_por = EXCLUDED.ignorado_por, ignorado_em = now();
  RETURN jsonb_build_object('ligadas', n);
END $$;
REVOKE ALL ON FUNCTION public.ligar_filiais(uuid, uuid[], text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ligar_filiais(uuid, uuid[], text) TO authenticated, service_role;

/* Desfaz uma decisão: "diferentes" volta para a lista; "filiais" solta as filhas. */
CREATE OR REPLACE FUNCTION public.reabrir_grupo_de_parecidas(_grupo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  d empresas_grupos_ignorados;
  n integer := 0;
BEGIN
  IF NOT public.is_manager(auth.uid()) AND current_user NOT IN ('postgres', 'service_role') THEN
    RAISE EXCEPTION 'Só a gestão reabre grupos';
  END IF;
  SELECT * INTO d FROM empresas_grupos_ignorados WHERE grupo = _grupo;
  IF d.grupo IS NULL THEN RETURN jsonb_build_object('ok', false); END IF;
  IF d.decisao = 'filiais' THEN
    UPDATE companies SET parent_company_id = NULL, updated_at = now()
     WHERE id = ANY(d.filhas) AND parent_company_id = d.mae_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    UPDATE cs_clients f SET parent_client_uid = NULL
     WHERE f.company_id = ANY(d.filhas)
       AND f.parent_client_uid IN (SELECT client_uid FROM cs_clients WHERE company_id = d.mae_id);
  END IF;
  DELETE FROM empresas_grupos_ignorados WHERE grupo = _grupo;
  RETURN jsonb_build_object('ok', true, 'soltas', n);
END $$;
REVOKE ALL ON FUNCTION public.reabrir_grupo_de_parecidas(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reabrir_grupo_de_parecidas(text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
