-- Analistas PDA: pessoas certificadas, importadas por CSV nas Configurações
-- do CS, ligadas à empresa (aba "Analistas PDA" na ficha). O vínculo com a
-- empresa sai, nesta ordem, do CNPJ, do e-mail já cadastrado num contato, do
-- domínio do e-mail (corporativo) ou do nome da empresa; sem nenhum, fica
-- "sem empresa" para a gestão ligar à mão. Importar de novo atualiza pelo
-- e-mail (sem duplicar).
CREATE TABLE IF NOT EXISTS public.analistas_pda (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  email text,
  telefone text,
  cargo text,
  empresa_informada text,
  cnpj text,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  -- como a empresa foi achada: cnpj, contato, dominio, nome ou manual
  vinculo text,
  certificado_em date,
  importacao text,
  dados jsonb NOT NULL DEFAULT '{}',
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS analistas_pda_email_key
  ON public.analistas_pda (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS analistas_pda_company_idx ON public.analistas_pda (company_id);

ALTER TABLE public.analistas_pda ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analistas_pda TO authenticated;
GRANT ALL ON public.analistas_pda TO service_role;
DROP POLICY IF EXISTS analistas_pda_ler ON public.analistas_pda;
CREATE POLICY analistas_pda_ler ON public.analistas_pda
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS analistas_pda_gestao ON public.analistas_pda;
CREATE POLICY analistas_pda_gestao ON public.analistas_pda
  FOR ALL TO authenticated USING (public.is_manager(auth.uid()))
  WITH CHECK (public.is_manager(auth.uid()));

-- Buscas da importação sem varrer a tabela de empresas a cada linha.
CREATE INDEX IF NOT EXISTS companies_chave_idx ON public.companies (public.empresa_chave(nome));
CREATE INDEX IF NOT EXISTS companies_cnpj_digitos_idx
  ON public.companies (regexp_replace(cnpj, '\D', '', 'g')) WHERE cnpj IS NOT NULL;
CREATE INDEX IF NOT EXISTS cs_contacts_email_lower_idx
  ON public.cs_contacts (lower(email)) WHERE email IS NOT NULL;

/*
 * Importa (ou atualiza pelo e-mail) as linhas: [{nome, email, telefone, cargo,
 * empresa, cnpj, certificado_em, dados}]. Marca também analista_pda nos
 * contatos de mesmo e-mail. Só a gestão.
 */
CREATE OR REPLACE FUNCTION public.importar_analistas_pda(_linhas jsonb, _importacao text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  l jsonb;
  v_email text;
  v_cnpj text;
  v_dom text;
  v_empresa uuid;
  v_vinculo text;
  v_cert date;
  v_existe uuid;
  novos int := 0;
  atualizados int := 0;
  sem_empresa int := 0;
  por_vinculo jsonb := '{}';
  livres text[] := ARRAY['gmail.com','hotmail.com','outlook.com','yahoo.com','yahoo.com.br',
    'icloud.com','live.com','bol.com.br','uol.com.br','terra.com.br','ig.com.br','msn.com',
    'globo.com','hotmail.com.br','outlook.com.br'];
BEGIN
  IF NOT public.is_manager(auth.uid()) AND current_user NOT IN ('postgres', 'service_role') THEN
    RAISE EXCEPTION 'Só a gestão importa analistas';
  END IF;
  FOR l IN SELECT * FROM jsonb_array_elements(coalesce(_linhas, '[]')) LOOP
    CONTINUE WHEN coalesce(trim(l->>'nome'), '') = '' AND coalesce(trim(l->>'email'), '') = '';
    v_email := nullif(lower(trim(coalesce(l->>'email', ''))), '');
    v_cnpj := nullif(regexp_replace(coalesce(l->>'cnpj', ''), '\D', '', 'g'), '');
    v_dom := CASE WHEN v_email LIKE '%@%' THEN split_part(v_email, '@', 2) END;
    v_empresa := NULL;
    v_vinculo := NULL;
    v_cert := CASE WHEN coalesce(l->>'certificado_em', '') ~ '^\d{4}-\d{2}-\d{2}$'
                   THEN (l->>'certificado_em')::date END;

    IF length(v_cnpj) = 14 THEN
      SELECT c.id INTO v_empresa FROM companies c
       WHERE regexp_replace(c.cnpj, '\D', '', 'g') = v_cnpj AND c.cnpj IS NOT NULL LIMIT 1;
      IF v_empresa IS NOT NULL THEN v_vinculo := 'cnpj'; END IF;
    END IF;
    IF v_empresa IS NULL AND v_email IS NOT NULL THEN
      SELECT ct.company_id INTO v_empresa FROM contacts ct
       WHERE lower(ct.email) = v_email AND ct.company_id IS NOT NULL LIMIT 1;
      IF v_empresa IS NULL THEN
        SELECT k.company_id INTO v_empresa FROM cs_contacts cc JOIN cs_clients k ON k.client_uid = cc.client_uid
         WHERE lower(cc.email) = v_email AND k.company_id IS NOT NULL LIMIT 1;
      END IF;
      IF v_empresa IS NOT NULL THEN v_vinculo := 'contato'; END IF;
    END IF;
    IF v_empresa IS NULL AND v_dom IS NOT NULL AND NOT (v_dom = ANY(livres)) THEN
      SELECT c.id INTO v_empresa FROM companies c WHERE lower(c.dominio) = v_dom
       AND (SELECT count(*) FROM companies c2 WHERE lower(c2.dominio) = v_dom) = 1;
      IF v_empresa IS NOT NULL THEN v_vinculo := 'dominio'; END IF;
    END IF;
    IF v_empresa IS NULL AND length(coalesce(public.empresa_chave(l->>'empresa'), '')) >= 3 THEN
      SELECT c.id INTO v_empresa FROM companies c
       WHERE public.empresa_chave(c.nome) = public.empresa_chave(l->>'empresa')
         AND (SELECT count(*) FROM companies c2
               WHERE public.empresa_chave(c2.nome) = public.empresa_chave(l->>'empresa')) = 1;
      IF v_empresa IS NOT NULL THEN v_vinculo := 'nome'; END IF;
    END IF;

    v_existe := NULL;
    IF v_email IS NOT NULL THEN
      SELECT a.id INTO v_existe FROM analistas_pda a WHERE lower(a.email) = v_email;
    END IF;
    IF v_existe IS NOT NULL THEN
      UPDATE analistas_pda a SET
        nome = coalesce(nullif(trim(l->>'nome'), ''), a.nome),
        telefone = coalesce(nullif(trim(l->>'telefone'), ''), a.telefone),
        cargo = coalesce(nullif(trim(l->>'cargo'), ''), a.cargo),
        empresa_informada = coalesce(nullif(trim(l->>'empresa'), ''), a.empresa_informada),
        cnpj = coalesce(v_cnpj, a.cnpj),
        -- vínculo feito à mão não é trocado pela importação
        company_id = CASE WHEN a.vinculo = 'manual' THEN a.company_id ELSE coalesce(v_empresa, a.company_id) END,
        vinculo = CASE WHEN a.vinculo = 'manual' THEN a.vinculo ELSE coalesce(v_vinculo, a.vinculo) END,
        certificado_em = coalesce(v_cert, a.certificado_em),
        importacao = _importacao,
        dados = a.dados || coalesce(l->'dados', '{}'),
        atualizado_em = now()
      WHERE a.id = v_existe;
      atualizados := atualizados + 1;
    ELSE
      INSERT INTO analistas_pda (nome, email, telefone, cargo, empresa_informada, cnpj,
                                 company_id, vinculo, certificado_em, importacao, dados)
      VALUES (coalesce(nullif(trim(l->>'nome'), ''), v_email), v_email,
              nullif(trim(l->>'telefone'), ''), nullif(trim(l->>'cargo'), ''),
              nullif(trim(l->>'empresa'), ''), v_cnpj, v_empresa, v_vinculo, v_cert,
              _importacao, coalesce(l->'dados', '{}'));
      novos := novos + 1;
    END IF;
    IF v_empresa IS NULL AND (v_existe IS NULL OR NOT EXISTS (
         SELECT 1 FROM analistas_pda a WHERE a.id = v_existe AND a.company_id IS NOT NULL)) THEN
      sem_empresa := sem_empresa + 1;
    END IF;
    por_vinculo := por_vinculo || jsonb_build_object(
      coalesce(v_vinculo, 'sem_empresa'),
      coalesce((por_vinculo->>coalesce(v_vinculo, 'sem_empresa'))::int, 0) + 1);

    -- O contato de mesmo e-mail também passa a ser analista.
    IF v_email IS NOT NULL THEN
      UPDATE contacts SET analista_pda = true WHERE lower(email) = v_email AND NOT analista_pda;
      UPDATE cs_contacts SET analista_pda = true,
             analista_certificado_em = coalesce(analista_certificado_em, v_cert)
       WHERE lower(email) = v_email AND NOT coalesce(analista_pda, false);
    END IF;
  END LOOP;
  RETURN jsonb_build_object('novos', novos, 'atualizados', atualizados,
                            'sem_empresa', sem_empresa, 'por_vinculo', por_vinculo);
END $$;
REVOKE ALL ON FUNCTION public.importar_analistas_pda(jsonb, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.importar_analistas_pda(jsonb, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
