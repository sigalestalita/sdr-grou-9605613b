-- Carteiras de quem saiu: negócios e empresas sem dono no Compass, agrupados pelo nome do dono no RD
-- (owner_original). A gestão transfere para quem quiser no painel de migração. A transferência marca
-- provenance.owner_user_id = 'manual', para a releitura do RD não voltar a deixar sem dono.

CREATE OR REPLACE FUNCTION public.carteiras_sem_dono()
RETURNS TABLE (nome text, negocios bigint, abertos bigint, ganhos bigint, empresas bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_manager(auth.uid()) AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
    RAISE EXCEPTION 'só a gestão';
  END IF;
  RETURN QUERY
  WITH n AS (
    SELECT d.owner_original AS nome, count(*) AS negocios,
           count(*) FILTER (WHERE d.status = 'open') AS abertos,
           count(*) FILTER (WHERE d.status = 'won') AS ganhos
    FROM deals d
    WHERE d.owner_user_id IS NULL AND d.executivo_user_id IS NULL AND NOT d.exemplo
      AND coalesce(trim(d.owner_original), '') <> ''
    GROUP BY 1
  ), e AS (
    SELECT c.owner_original AS nome, count(*) AS empresas
    FROM companies c
    WHERE c.owner_user_id IS NULL AND c.ativo AND coalesce(trim(c.owner_original), '') <> ''
    GROUP BY 1
  )
  SELECT coalesce(n.nome, e.nome), coalesce(n.negocios, 0), coalesce(n.abertos, 0), coalesce(n.ganhos, 0), coalesce(e.empresas, 0)
  FROM n FULL JOIN e ON e.nome = n.nome
  ORDER BY coalesce(n.abertos, 0) DESC, coalesce(n.negocios, 0) + coalesce(e.empresas, 0) DESC;
END $$;

CREATE OR REPLACE FUNCTION public.transferir_carteira(
  _nome text, _destino uuid, _negocios text DEFAULT 'abertos', _empresas boolean DEFAULT true)
RETURNS TABLE (negocios bigint, empresas bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n bigint := 0; e bigint := 0;
BEGIN
  IF NOT public.is_manager(auth.uid()) AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
    RAISE EXCEPTION 'só a gestão';
  END IF;
  IF _negocios NOT IN ('nenhum', 'abertos', 'todos') THEN RAISE EXCEPTION 'opção inválida'; END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = _destino) THEN RAISE EXCEPTION 'usuário não encontrado'; END IF;
  IF _negocios <> 'nenhum' THEN
    UPDATE deals d SET owner_user_id = _destino, updated_at = now(),
      provenance = coalesce(d.provenance, '{}'::jsonb) || jsonb_build_object('owner_user_id', 'manual')
    WHERE d.owner_user_id IS NULL AND d.executivo_user_id IS NULL AND NOT d.exemplo
      AND d.owner_original = _nome AND (_negocios = 'todos' OR d.status = 'open');
    GET DIAGNOSTICS n = ROW_COUNT;
  END IF;
  IF _empresas THEN
    UPDATE companies c SET owner_user_id = _destino, updated_at = now(),
      provenance = coalesce(c.provenance, '{}'::jsonb) || jsonb_build_object('owner_user_id', 'manual')
    WHERE c.owner_user_id IS NULL AND c.ativo AND c.owner_original = _nome;
    GET DIAGNOSTICS e = ROW_COUNT;
  END IF;
  INSERT INTO integration_logs (provider, action, status, detail)
  VALUES ('compass', 'transferir_carteira', 'ok',
          jsonb_build_object('nome', _nome, 'destino', _destino, 'negocios', n, 'empresas', e, 'opcao', _negocios, 'por', auth.uid()));
  RETURN QUERY SELECT n, e;
END $$;

REVOKE ALL ON FUNCTION public.carteiras_sem_dono() FROM public, anon;
REVOKE ALL ON FUNCTION public.transferir_carteira(text, uuid, text, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.carteiras_sem_dono() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.transferir_carteira(text, uuid, text, boolean) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
