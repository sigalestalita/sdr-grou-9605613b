-- Mesclar empresas também junta as fichas do CS: se, depois da mescla, a
-- empresa ficar com mais de uma ficha ativa, todo o histórico vai para uma só
-- (a do contrato mais recente) e a outra fica inativa, marcada com mesclado_em
-- (para a sincronização do RD não reativá-la).
ALTER TABLE public.cs_clients ADD COLUMN IF NOT EXISTS mesclado_em text;

CREATE OR REPLACE FUNCTION public.mesclar_clientes_cs(_fica text, _sai text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  f cs_clients; s cs_clients; n integer; total integer := 0;
  t text;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_manager(auth.uid()) THEN
    RAISE EXCEPTION 'Só a gestão mescla fichas';
  END IF;
  SELECT * INTO f FROM cs_clients WHERE client_uid = _fica;
  SELECT * INTO s FROM cs_clients WHERE client_uid = _sai;
  IF f.id IS NULL OR s.id IS NULL OR _fica = _sai THEN RAISE EXCEPTION 'Fichas inválidas'; END IF;

  -- Contatos repetidos (mesmo contato da base ou mesmo e-mail): aponta as
  -- referências para o da ficha que fica e apaga o repetido.
  DROP TABLE IF EXISTS _dup;
  CREATE TEMP TABLE _dup ON COMMIT DROP AS
    SELECT cs.id sai_id, (
      SELECT cf.id FROM cs_contacts cf WHERE cf.client_uid = _fica
        AND ((cs.contact_id IS NOT NULL AND cf.contact_id = cs.contact_id)
          OR (cs.email IS NOT NULL AND cf.email IS NOT NULL AND lower(cf.email) = lower(cs.email)))
      LIMIT 1) fica_id
    FROM cs_contacts cs WHERE cs.client_uid = _sai;
  DELETE FROM _dup WHERE fica_id IS NULL;
  UPDATE cs_tasks x SET contact_id = d.fica_id FROM _dup d WHERE x.contact_id = d.sai_id;
  UPDATE cs_meetings x SET contact_id = d.fica_id FROM _dup d WHERE x.contact_id = d.sai_id;
  UPDATE cs_reuniao_ofertas x SET contact_id = d.fica_id FROM _dup d WHERE x.contact_id = d.sai_id;
  UPDATE cs_calendly_events x SET contact_id = d.fica_id FROM _dup d WHERE x.contact_id = d.sai_id;
  UPDATE cs_masterclass_participations x SET contact_id = d.fica_id FROM _dup d WHERE x.contact_id = d.sai_id;
  UPDATE cs_journey_emails x SET contact_id = d.fica_id FROM _dup d WHERE x.contact_id = d.sai_id;
  UPDATE cs_contacts cf SET
      analista_pda = cf.analista_pda OR cs.analista_pda,
      tags = ARRAY(SELECT DISTINCT unnest(cf.tags || cs.tags))
    FROM _dup d JOIN cs_contacts cs ON cs.id = d.sai_id
    WHERE cf.id = d.fica_id;
  DELETE FROM cs_contacts WHERE id IN (SELECT sai_id FROM _dup);

  -- Tabelas com chave única por ficha: o que já existe na que fica prevalece.
  DELETE FROM cs_signal_snapshots a WHERE a.client_uid = _sai
    AND EXISTS (SELECT 1 FROM cs_signal_snapshots b WHERE b.client_uid = _fica AND b.week_start = a.week_start);
  DELETE FROM cs_cadence_tasks a WHERE a.client_uid = _sai
    AND EXISTS (SELECT 1 FROM cs_cadence_tasks b WHERE b.client_uid = _fica AND b.week_start = a.week_start);
  DELETE FROM cs_journey_emails a WHERE a.client_uid = _sai
    AND EXISTS (SELECT 1 FROM cs_journey_emails b WHERE b.client_uid = _fica AND b.email_id = a.email_id);
  DELETE FROM cs_plataforma_uso a WHERE a.client_uid = _sai
    AND EXISTS (SELECT 1 FROM cs_plataforma_uso b WHERE b.client_uid = _fica AND b.email = a.email);
  DELETE FROM cs_client_tags a WHERE a.client_uid = _sai
    AND EXISTS (SELECT 1 FROM cs_client_tags b WHERE b.client_uid = _fica AND b.tag = a.tag);

  FOREACH t IN ARRAY ARRAY['cs_alerts','cs_cadence_tasks','cs_calendly_events','cs_client_tags','cs_contacts',
    'cs_emails','cs_escalation_notices','cs_feature_offers','cs_journey_emails','cs_masterclass_participations',
    'cs_meetings','cs_oportunidades','cs_plataforma_uso','cs_records','cs_reuniao_ofertas','cs_sales',
    'cs_signal_snapshots','cs_tasks','cs_tickets','cs_timeline_events','whatsapp_conversations']
  LOOP
    EXECUTE format('UPDATE %I SET client_uid = $1 WHERE client_uid = $2', t) USING _fica, _sai;
    GET DIAGNOSTICS n = ROW_COUNT;
    total := total + n;
  END LOOP;
  UPDATE cs_clients SET parent_client_uid = _fica WHERE parent_client_uid = _sai;

  -- O que estiver vazio na que fica, vem da que sai.
  UPDATE cs_clients SET
    rd_org_id = COALESCE(f.rd_org_id, s.rd_org_id),
    cnpj = COALESCE(f.cnpj, s.cnpj),
    cs_responsavel_id = COALESCE(f.cs_responsavel_id, s.cs_responsavel_id),
    comercial_responsavel_id = COALESCE(f.comercial_responsavel_id, s.comercial_responsavel_id),
    last_contact_at = GREATEST(f.last_contact_at, s.last_contact_at),
    updated_at = now()
  WHERE client_uid = _fica;
  -- Se o vínculo com o RD passou para a que fica, sai daqui; se a que fica já
  -- tinha o seu, este continua aqui (a sincronização segue mesclado_em).
  UPDATE cs_clients SET ativo = false, mesclado_em = _fica,
    rd_org_id = CASE WHEN f.rd_org_id IS NULL THEN NULL ELSE s.rd_org_id END, updated_at = now()
  WHERE client_uid = _sai;

  INSERT INTO cs_timeline_events (client_uid, author_id, event_type, channel, title, description, occurred_at, metadata)
  VALUES (_fica, auth.uid(), 'nota', 'observacao', 'Fichas mescladas',
          format('A ficha %s (%s) foi juntada a esta: %s registros movidos.', _sai, s.nome_empresa, total),
          now(), jsonb_build_object('mesclada', _sai, 'registros', total));
  RETURN jsonb_build_object('fica', _fica, 'sai', _sai, 'registros', total);
END $$;
REVOKE ALL ON FUNCTION public.mesclar_clientes_cs(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mesclar_clientes_cs(text, text) TO authenticated, service_role;

-- Junta as fichas ativas de uma empresa na do contrato mais recente.
CREATE OR REPLACE FUNCTION public.juntar_fichas_da_empresa(_company uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE fica text; r record; n integer := 0;
BEGIN
  SELECT client_uid INTO fica FROM cs_clients
   WHERE company_id = _company AND ativo
   ORDER BY data_renovacao DESC NULLS LAST, created_at DESC LIMIT 1;
  IF fica IS NULL THEN RETURN 0; END IF;
  FOR r IN SELECT client_uid FROM cs_clients WHERE company_id = _company AND ativo AND client_uid <> fica LOOP
    PERFORM public.mesclar_clientes_cs(fica, r.client_uid);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.juntar_fichas_da_empresa(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.juntar_fichas_da_empresa(uuid) TO authenticated, service_role;

-- Toda mescla de empresas passa a juntar também as fichas do CS.
CREATE OR REPLACE FUNCTION public.mesclar_empresas(_fica uuid, _sai uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  fica companies;
  sai companies;
  movidos jsonb := '{}';
  n integer;
  t record;
BEGIN
  IF NOT public.is_manager(auth.uid()) AND coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Só a gestão mescla empresas';
  END IF;
  IF _fica = _sai THEN RAISE EXCEPTION 'Escolha duas empresas diferentes'; END IF;
  SELECT * INTO fica FROM companies WHERE id = _fica FOR UPDATE;
  SELECT * INTO sai FROM companies WHERE id = _sai FOR UPDATE;
  IF fica.id IS NULL OR sai.id IS NULL THEN RAISE EXCEPTION 'Empresa não encontrada'; END IF;

  DELETE FROM company_contacts s WHERE s.company_id = _sai
    AND EXISTS (SELECT 1 FROM company_contacts f WHERE f.company_id = _fica AND f.contact_id = s.contact_id);
  DELETE FROM company_funis s WHERE s.company_id = _sai
    AND EXISTS (SELECT 1 FROM company_funis f WHERE f.company_id = _fica AND f.pipeline_id = s.pipeline_id);
  IF EXISTS (SELECT 1 FROM company_faturamento WHERE company_id = _fica) THEN
    DELETE FROM company_faturamento WHERE company_id = _sai;
  END IF;
  UPDATE companies SET parent_company_id = NULL WHERE id = _fica AND parent_company_id = _sai;

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

  INSERT INTO empresas_mescladas (fica_id, sai_id, sai_nome, sai_rd_org_id, sai_dados, movidos, mesclado_por)
  VALUES (_fica, _sai, sai.nome, sai.rd_org_id, to_jsonb(sai), movidos, auth.uid());

  DELETE FROM companies WHERE id = _sai;
  IF fica.rd_org_id IS NULL AND sai.rd_org_id IS NOT NULL THEN
    UPDATE companies SET rd_org_id = sai.rd_org_id WHERE id = _fica;
  END IF;

  n := public.juntar_fichas_da_empresa(_fica);
  IF n > 0 THEN movidos := movidos || jsonb_build_object('fichas_cs_juntadas', n); END IF;

  RETURN jsonb_build_object('fica', _fica, 'sai', _sai, 'movidos', movidos);
END $function$;

NOTIFY pgrst, 'reload schema';
