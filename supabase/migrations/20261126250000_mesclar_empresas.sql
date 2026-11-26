-- Mesclar empresas parecidas.
--   * empresa_chave(nome): nome sem acento, pontuação e sufixos (Ltda, S.A.,
--     Eireli, ME…) — duas empresas com a mesma chave são candidatas.
--   * empresas_parecidas(): grupos por chave do nome, CNPJ ou domínio, com o
--     que cada empresa tem ligado (contatos, leads, negócios, cliente CS).
--   * mesclar_empresas(fica, sai): move tudo o que aponta para a que sai,
--     completa os campos vazios da que fica, registra em empresas_mescladas e
--     apaga a que sai. Só a gestão.
--   * empresas_mescladas guarda também o rd_org_id da que saiu: a
--     transformação do RD usa isso para mandar aquela organização para a
--     empresa que ficou (sem recriar a duplicata).

CREATE OR REPLACE FUNCTION public.empresa_chave(_nome text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT nullif(trim(regexp_replace(regexp_replace(regexp_replace(
    lower(translate(coalesce(_nome, ''),
      'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
      'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')),
    '[^a-z0-9 ]', ' ', 'g'),
    '\m(ltda|ltd|s a|sa|s/a|eireli|me|epp|cia|companhia|do|da|de|dos|das|e)\M', ' ', 'g'),
    '\s+', ' ', 'g')), '')
$$;

CREATE TABLE IF NOT EXISTS public.empresas_mescladas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fica_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sai_id uuid NOT NULL,
  sai_nome text,
  sai_rd_org_id text,
  sai_dados jsonb NOT NULL,
  movidos jsonb NOT NULL DEFAULT '{}',
  mesclado_por uuid,
  mesclado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS empresas_mescladas_rd_idx
  ON public.empresas_mescladas (sai_rd_org_id) WHERE sai_rd_org_id IS NOT NULL;
ALTER TABLE public.empresas_mescladas ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.empresas_mescladas TO authenticated;
GRANT ALL ON public.empresas_mescladas TO service_role;
DROP POLICY IF EXISTS empresas_mescladas_ler ON public.empresas_mescladas;
CREATE POLICY empresas_mescladas_ler ON public.empresas_mescladas
  FOR SELECT TO authenticated USING (public.is_manager(auth.uid()));

-- Grupos que a gestão marcou como "não são a mesma empresa".
CREATE TABLE IF NOT EXISTS public.empresas_grupos_ignorados (
  grupo text PRIMARY KEY,
  ignorado_por uuid,
  ignorado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.empresas_grupos_ignorados ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.empresas_grupos_ignorados TO service_role;
GRANT SELECT, INSERT, DELETE ON public.empresas_grupos_ignorados TO authenticated;
DROP POLICY IF EXISTS empresas_grupos_ignorados_gestao ON public.empresas_grupos_ignorados;
CREATE POLICY empresas_grupos_ignorados_gestao ON public.empresas_grupos_ignorados
  FOR ALL TO authenticated USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

CREATE OR REPLACE FUNCTION public.empresas_parecidas(_limite integer DEFAULT 300)
RETURNS TABLE (
  grupo text, motivo text, id uuid, uid text, nome text, cnpj text, dominio text,
  cidade text, estado text, rd_org_id text, cliente boolean,
  contatos bigint, leads bigint, negocios bigint, criado_em timestamptz
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
  escolhidos AS (
    SELECT g FROM grupos
    WHERE g NOT IN (SELECT i.grupo FROM empresas_grupos_ignorados i)
    GROUP BY g
    ORDER BY min(CASE WHEN g LIKE 'cnpj:%' THEN 0 WHEN g LIKE 'dominio:%' THEN 1 ELSE 2 END), g
    LIMIT _limite
  )
  SELECT gr.g, gr.m, b.id, b.uid, b.nome, b.cnpj, b.dominio, b.cidade, b.estado, b.rd_org_id,
         EXISTS (SELECT 1 FROM cs_clients k WHERE k.company_id = b.id AND k.ativo),
         (SELECT count(*) FROM contacts ct WHERE ct.company_id = b.id),
         (SELECT count(*) FROM leads l WHERE l.company_id = b.id),
         (SELECT count(*) FROM deals d WHERE d.company_id = b.id),
         b.created_at
  FROM grupos gr JOIN escolhidos e ON e.g = gr.g JOIN base b ON b.id = gr.id
  ORDER BY gr.g, b.created_at;
END $$;
REVOKE ALL ON FUNCTION public.empresas_parecidas(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.empresas_parecidas(integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mesclar_empresas(_fica uuid, _sai uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  fica companies;
  sai companies;
  movidos jsonb := '{}';
  n integer;
  t record;
BEGIN
  IF NOT public.is_manager(auth.uid()) AND current_user NOT IN ('postgres', 'service_role') THEN
    RAISE EXCEPTION 'Só a gestão mescla empresas';
  END IF;
  IF _fica = _sai THEN RAISE EXCEPTION 'Escolha duas empresas diferentes'; END IF;
  SELECT * INTO fica FROM companies WHERE id = _fica FOR UPDATE;
  SELECT * INTO sai FROM companies WHERE id = _sai FOR UPDATE;
  IF fica.id IS NULL OR sai.id IS NULL THEN RAISE EXCEPTION 'Empresa não encontrada'; END IF;

  -- Ligações com chave única: tira da que sai o que a que fica já tem.
  DELETE FROM company_contacts s WHERE s.company_id = _sai
    AND EXISTS (SELECT 1 FROM company_contacts f WHERE f.company_id = _fica AND f.contact_id = s.contact_id);
  DELETE FROM company_funis s WHERE s.company_id = _sai
    AND EXISTS (SELECT 1 FROM company_funis f WHERE f.company_id = _fica AND f.pipeline_id = s.pipeline_id);
  IF EXISTS (SELECT 1 FROM company_faturamento WHERE company_id = _fica) THEN
    DELETE FROM company_faturamento WHERE company_id = _sai;
  END IF;
  -- Filial que apontava para a que sai passa a apontar para a que fica.
  UPDATE companies SET parent_company_id = NULL WHERE id = _fica AND parent_company_id = _sai;

  -- Tudo o que aponta para companies(id) (descoberto pelas chaves estrangeiras).
  FOR t IN
    SELECT c.conrelid::regclass AS tabela, a.attname AS coluna
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f' AND c.confrelid = 'public.companies'::regclass
      AND array_length(c.conkey, 1) = 1
      AND c.conrelid <> 'public.empresas_mescladas'::regclass
  LOOP
    EXECUTE format('UPDATE %s SET %I = $1 WHERE %I = $2', t.tabela, t.coluna, t.coluna)
      USING _fica, _sai;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN movidos := movidos || jsonb_build_object(t.tabela::text || '.' || t.coluna, n); END IF;
  END LOOP;

  -- O que a que fica não tem, vem da que sai.
  UPDATE companies SET
    cnpj = coalesce(nullif(fica.cnpj, ''), sai.cnpj),
    dominio = coalesce(nullif(fica.dominio, ''), sai.dominio),
    site_url = coalesce(nullif(fica.site_url, ''), sai.site_url),
    linkedin_url = coalesce(nullif(fica.linkedin_url, ''), sai.linkedin_url),
    telefone = coalesce(nullif(fica.telefone, ''), sai.telefone),
    cidade = coalesce(nullif(fica.cidade, ''), sai.cidade),
    estado = coalesce(nullif(fica.estado, ''), sai.estado),
    cep = coalesce(nullif(fica.cep, ''), sai.cep),
    segmento = coalesce(nullif(fica.segmento, ''), sai.segmento),
    porte = coalesce(nullif(fica.porte, ''), sai.porte),
    num_funcionarios = coalesce(fica.num_funcionarios, sai.num_funcionarios),
    sdr_user_id = coalesce(fica.sdr_user_id, sai.sdr_user_id),
    owner_user_id = coalesce(fica.owner_user_id, sai.owner_user_id),
    parent_company_id = coalesce(fica.parent_company_id,
                                 CASE WHEN sai.parent_company_id = _fica THEN NULL ELSE sai.parent_company_id END),
    hubspot_id = coalesce(fica.hubspot_id, sai.hubspot_id),
    regime_tributario = coalesce(fica.regime_tributario, sai.regime_tributario),
    analista_pda_declarado = fica.analista_pda_declarado OR sai.analista_pda_declarado,
    updated_at = now()
  WHERE id = _fica;
  -- Código do RD: se a que fica não tem, herda (depois que a que sai for apagada).

  INSERT INTO empresas_mescladas (fica_id, sai_id, sai_nome, sai_rd_org_id, sai_dados, movidos, mesclado_por)
  VALUES (_fica, _sai, sai.nome, sai.rd_org_id, to_jsonb(sai), movidos, auth.uid());

  DELETE FROM companies WHERE id = _sai;
  IF fica.rd_org_id IS NULL AND sai.rd_org_id IS NOT NULL THEN
    UPDATE companies SET rd_org_id = sai.rd_org_id WHERE id = _fica;
  END IF;

  RETURN jsonb_build_object('fica', _fica, 'sai', _sai, 'movidos', movidos);
END $$;
REVOKE ALL ON FUNCTION public.mesclar_empresas(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mesclar_empresas(uuid, uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
