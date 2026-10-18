-- Espinha dorsal do CRM: Empresa × Contato × Negócio.
--
-- Regras (as mesmas do RD):
--   * a empresa é o centro: pode ter 0..N contatos e 0..N negócios;
--   * contato liga-se a uma ou mais empresas (company_contacts, com papel);
--   * negócio SEMPRE tem empresa; contatos no negócio são opcionais (deal_contacts).
--
-- E a decisão do funil de SDR: o card do SDR é a PESSOA (o lead, ligado a um
-- contato e, quando se sabe, à empresa). O negócio nasce quando o SDR passa o
-- lead para o executivo — passar_lead_para_executivo, abaixo.

-- ---------------------------------------------------------------------------
-- 1. Negócio sempre com empresa
-- ---------------------------------------------------------------------------
/**
 * Empresa que um negócio sem empresa deve receber: a do contato principal; sem
 * contato com empresa, uma empresa nova — de pessoa física quando o negócio é
 * de uma pessoa, ou com o nome do próprio negócio.
 */
CREATE OR REPLACE FUNCTION public.deals_garante_empresa()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_contato_nome text;
BEGIN
  IF NEW.company_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.contact_id IS NOT NULL THEN
    SELECT company_id, nome INTO v_company, v_contato_nome
      FROM public.contacts WHERE id = NEW.contact_id;
  END IF;
  IF v_company IS NULL AND TG_OP = 'UPDATE' THEN
    SELECT c.company_id, c.nome INTO v_company, v_contato_nome
      FROM public.deal_contacts dc JOIN public.contacts c ON c.id = dc.contact_id
     WHERE dc.deal_id = NEW.id AND c.company_id IS NOT NULL
     ORDER BY dc.principal DESC
     LIMIT 1;
  END IF;

  IF v_company IS NULL THEN
    INSERT INTO public.companies (nome, tipo_lead, provenance)
    VALUES (
      COALESCE(NULLIF(trim(v_contato_nome), ''), NULLIF(trim(NEW.nome), ''), 'Empresa sem nome'),
      CASE WHEN v_contato_nome IS NOT NULL THEN 'pessoa_fisica'::public.cs_client_type
           ELSE 'empresa'::public.cs_client_type END,
      jsonb_build_object('origem', 'negocio_sem_empresa')
    )
    RETURNING id INTO v_company;
    IF NEW.contact_id IS NOT NULL THEN
      UPDATE public.contacts SET company_id = v_company WHERE id = NEW.contact_id AND company_id IS NULL;
      INSERT INTO public.company_contacts (company_id, contact_id, principal)
      VALUES (v_company, NEW.contact_id, true) ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  NEW.company_id := v_company;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.deals_garante_empresa() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS deals_garante_empresa ON public.deals;
CREATE TRIGGER deals_garante_empresa
  BEFORE INSERT OR UPDATE OF company_id, contact_id ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.deals_garante_empresa();

-- Negócios antigos sem empresa (do RD e dos exemplos) ganham uma agora.
UPDATE public.deals SET company_id = NULL WHERE company_id IS NULL;

ALTER TABLE public.deals ALTER COLUMN company_id SET NOT NULL;
-- Apagar a empresa não pode deixar negócio órfão (antes era SET NULL).
ALTER TABLE public.deals DROP CONSTRAINT IF EXISTS deals_company_id_fkey;
ALTER TABLE public.deals ADD CONSTRAINT deals_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;

-- ---------------------------------------------------------------------------
-- 2. Papel do contato na empresa e no negócio
-- ---------------------------------------------------------------------------
-- decisor, influenciador, rh, financeiro (recebe nota/boleto), analista_pda
-- (é com ele que se cria o login do PDA), contratante, participante, outro.
ALTER TABLE public.deal_contacts ADD COLUMN IF NOT EXISTS papel text;
COMMENT ON COLUMN public.deal_contacts.papel IS
  'decisor | influenciador | rh | financeiro | analista_pda | contratante | participante | outro';
COMMENT ON COLUMN public.company_contacts.papel IS
  'decisor | influenciador | rh | financeiro | analista_pda | contratante | participante | outro';
CREATE INDEX IF NOT EXISTS idx_deal_contacts_contact ON public.deal_contacts (contact_id);
CREATE INDEX IF NOT EXISTS idx_company_contacts_contact ON public.company_contacts (contact_id);

-- ---------------------------------------------------------------------------
-- 3. Lead (card do SDR) ligado a contato e empresa
-- ---------------------------------------------------------------------------
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS contact_id uuid
  REFERENCES public.contacts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_leads_contact ON public.leads (contact_id);
CREATE INDEX IF NOT EXISTS idx_leads_sem_contato ON public.leads (created_at DESC) WHERE contact_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_phone_key ON public.contacts (public.phone_key(telefone))
  WHERE telefone IS NOT NULL;

/** Domínio corporativo do site ou do e-mail (e-mail gratuito não conta). */
CREATE OR REPLACE FUNCTION public.dominio_corporativo(_email text, _site text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  WITH s AS (
    SELECT NULLIF(lower(regexp_replace(regexp_replace(COALESCE(_site, ''), '^\s*(https?://)?(www\.)?', ''), '[/?#:].*$', '')), '') AS site,
           NULLIF(lower(split_part(COALESCE(_email, ''), '@', 2)), '') AS mail
  )
  SELECT CASE
    WHEN site IS NOT NULL AND site LIKE '%.%' THEN site
    WHEN mail IS NOT NULL AND mail NOT IN (
      'gmail.com', 'hotmail.com', 'hotmail.com.br', 'outlook.com', 'outlook.com.br', 'live.com',
      'yahoo.com', 'yahoo.com.br', 'icloud.com', 'me.com', 'uol.com.br', 'bol.com.br',
      'terra.com.br', 'ig.com.br', 'msn.com', 'globo.com', 'globomail.com', 'protonmail.com', 'aol.com'
    ) THEN mail
  END FROM s
$$;

/** Mesma normalização da coluna companies.nome_normalizado. */
CREATE OR REPLACE FUNCTION public.nome_empresa_normalizado(_nome text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$ SELECT lower(regexp_replace(_nome, '[^a-zA-Z0-9]+', ' ', 'g')) $$;

/**
 * Liga o lead ao contato (acha por e-mail ou telefone; senão cria) e à
 * empresa (acha por domínio ou nome; cria só para lead em trabalho no SDR —
 * a base de marketing importada não vira milhares de empresas soltas).
 */
CREATE OR REPLACE FUNCTION public.vincular_lead(_lead uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  l public.leads;
  v_contact uuid;
  v_company uuid;
  v_dominio text;
  v_nome_emp text;
BEGIN
  SELECT * INTO l FROM public.leads WHERE id = _lead;
  IF l.id IS NULL THEN RETURN; END IF;

  -- contato
  v_contact := l.contact_id;
  IF v_contact IS NULL AND NULLIF(trim(l.email), '') IS NOT NULL THEN
    SELECT id INTO v_contact FROM public.contacts
     WHERE lower(email) = lower(trim(l.email)) ORDER BY created_at LIMIT 1;
  END IF;
  IF v_contact IS NULL AND l.phone_key IS NOT NULL THEN
    SELECT id INTO v_contact FROM public.contacts
     WHERE telefone IS NOT NULL AND public.phone_key(telefone) = l.phone_key
     ORDER BY created_at LIMIT 1;
  END IF;
  IF v_contact IS NULL THEN
    INSERT INTO public.contacts (nome, email, telefone, cargo, sdr_user_id, provenance)
    VALUES (COALESCE(NULLIF(trim(l.name), ''), l.email, 'Sem nome'), NULLIF(lower(trim(l.email)), ''),
            NULLIF(trim(l.phone), ''), NULLIF(trim(l.position), ''), l.assigned_to,
            jsonb_build_object('origem', 'lead'))
    RETURNING id INTO v_contact;
  END IF;

  -- empresa
  v_company := l.company_id;
  IF v_company IS NULL THEN
    SELECT company_id INTO v_company FROM public.contacts WHERE id = v_contact;
  END IF;
  v_nome_emp := NULLIF(trim(COALESCE(l.company_name, '')), '');
  IF v_nome_emp ~* '^(-+|n/?a|na|nao|não|nenhuma|particular|autonom[oa]|pessoa f[ií]sica)$' THEN
    v_nome_emp := NULL;
  END IF;
  IF v_company IS NULL THEN
    v_dominio := public.dominio_corporativo(l.email, l.company_website);
    IF v_dominio IS NOT NULL THEN
      SELECT id INTO v_company FROM public.companies
       WHERE lower(dominio) = v_dominio ORDER BY created_at LIMIT 1;
    END IF;
    IF v_company IS NULL AND v_nome_emp IS NOT NULL THEN
      SELECT id INTO v_company FROM public.companies
       WHERE nome_normalizado = public.nome_empresa_normalizado(v_nome_emp)
       ORDER BY created_at LIMIT 1;
    END IF;
    IF v_company IS NULL AND v_nome_emp IS NOT NULL AND NOT COALESCE(l.oculto_sdr, false)
       AND COALESCE(l.lead_type, '') <> 'pessoa_fisica' THEN
      INSERT INTO public.companies (nome, dominio, tipo_lead, segmento, sdr_user_id, provenance)
      VALUES (v_nome_emp, v_dominio,
              CASE WHEN l.lead_type = 'consultoria' THEN 'consultoria'::public.cs_client_type
                   ELSE 'empresa'::public.cs_client_type END,
              NULLIF(trim(l.company_segment), ''), l.assigned_to,
              jsonb_build_object('origem', 'lead'))
      RETURNING id INTO v_company;
    END IF;
  END IF;

  IF v_company IS NOT NULL THEN
    UPDATE public.contacts SET company_id = v_company WHERE id = v_contact AND company_id IS NULL;
    INSERT INTO public.company_contacts (company_id, contact_id, principal)
    VALUES (v_company, v_contact, false) ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.leads
     SET contact_id = v_contact,
         company_id = COALESCE(company_id, v_company)
   WHERE id = _lead;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.vincular_lead(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vincular_lead(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.leads_vincula()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.vincular_lead(NEW.id);
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.leads_vincula() FROM PUBLIC, anon, authenticated;
-- Sem contact_id/company_id na lista de colunas: a própria função atualiza os
-- dois e não pode disparar de novo.
DROP TRIGGER IF EXISTS leads_vincula ON public.leads;
CREATE TRIGGER leads_vincula
  AFTER INSERT OR UPDATE OF email, phone, company_name, company_website, oculto_sdr ON public.leads
  FOR EACH ROW WHEN (NEW.contact_id IS NULL OR NEW.company_id IS NULL)
  EXECUTE FUNCTION public.leads_vincula();

/** Leads antigos sem contato, em lotes (o cron chama até zerar). */
CREATE OR REPLACE FUNCTION public.vincular_leads_pendentes(_limite integer DEFAULT 1000)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r record; n integer := 0;
BEGIN
  FOR r IN SELECT id FROM public.leads WHERE contact_id IS NULL
            ORDER BY created_at DESC LIMIT LEAST(GREATEST(_limite, 1), 5000) LOOP
    PERFORM public.vincular_lead(r.id);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.vincular_leads_pendentes(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vincular_leads_pendentes(integer) TO service_role;

DO $$
BEGIN
  PERFORM cron.unschedule('vincular-leads') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'vincular-leads');
  PERFORM cron.schedule('vincular-leads', '*/2 * * * *', 'SELECT public.vincular_leads_pendentes(1000)');
EXCEPTION WHEN undefined_function OR invalid_schema_name OR undefined_table THEN
  RAISE NOTICE 'pg_cron indisponível: rode SELECT public.vincular_leads_pendentes(1000) até voltar 0';
END $$;

-- ---------------------------------------------------------------------------
-- 4. Passar o lead para o executivo = nasce o negócio
-- ---------------------------------------------------------------------------
/**
 * O SDR qualificou: o lead vira negócio no funil Vendas (novos-negocios), na
 * primeira etapa, com a empresa e o contato da espinha, o SDR que trouxe e o
 * executivo que assume. Se o lead já tem negócio, só confirma o executivo.
 * Devolve o id do negócio.
 */
CREATE OR REPLACE FUNCTION public.passar_lead_para_executivo(
  _lead uuid, _executivo uuid, _nome text DEFAULT NULL, _valor numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  l public.leads;
  v_company uuid;
  v_pipeline uuid;
  v_stage uuid;
  v_deal uuid;
  v_cliente boolean;
  v_empresa_nome text;
BEGIN
  -- auth.uid() nulo = chamada do servidor (service role), ex.: envio do convite.
  IF auth.uid() IS NOT NULL AND NOT (
       public.is_manager(auth.uid()) OR public.has_team(auth.uid(), 'comercial')
  ) THEN
    RAISE EXCEPTION 'Só o comercial passa lead para o executivo';
  END IF;
  IF _executivo IS NULL THEN RAISE EXCEPTION 'Escolha o executivo'; END IF;

  PERFORM public.vincular_lead(_lead);
  SELECT * INTO l FROM public.leads WHERE id = _lead FOR UPDATE;
  IF l.id IS NULL THEN RAISE EXCEPTION 'Lead não encontrado'; END IF;

  IF l.deal_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.deals WHERE id = l.deal_id) THEN
    UPDATE public.deals SET executivo_user_id = COALESCE(executivo_user_id, _executivo)
     WHERE id = l.deal_id;
    UPDATE public.leads SET executivo_id = COALESCE(executivo_id, _executivo) WHERE id = _lead;
    RETURN l.deal_id;
  END IF;

  -- empresa: a do lead; sem ela, cria (pessoa física ou com o nome informado)
  v_company := l.company_id;
  IF v_company IS NULL THEN
    INSERT INTO public.companies (nome, dominio, tipo_lead, sdr_user_id, provenance)
    VALUES (COALESCE(NULLIF(trim(l.company_name), ''), NULLIF(trim(l.name), ''), 'Sem nome'),
            public.dominio_corporativo(l.email, l.company_website),
            CASE WHEN l.lead_type = 'consultoria' THEN 'consultoria'::public.cs_client_type
                 WHEN l.lead_type = 'pessoa_fisica' OR NULLIF(trim(l.company_name), '') IS NULL
                   THEN 'pessoa_fisica'::public.cs_client_type
                 ELSE 'empresa'::public.cs_client_type END,
            l.assigned_to, jsonb_build_object('origem', 'passagem_sdr'))
    RETURNING id INTO v_company;
    UPDATE public.contacts SET company_id = v_company WHERE id = l.contact_id AND company_id IS NULL;
    INSERT INTO public.company_contacts (company_id, contact_id, principal)
    VALUES (v_company, l.contact_id, true) ON CONFLICT DO NOTHING;
  END IF;
  SELECT nome INTO v_empresa_nome FROM public.companies WHERE id = v_company;

  SELECT id INTO v_pipeline FROM public.pipelines WHERE slug = 'novos-negocios';
  SELECT id INTO v_stage FROM public.pipeline_stages
   WHERE pipeline_id = v_pipeline AND kind = 'open' ORDER BY ordem LIMIT 1;
  SELECT EXISTS (SELECT 1 FROM public.deals WHERE company_id = v_company AND status = 'won')
    INTO v_cliente;

  INSERT INTO public.deals (
    nome, company_id, contact_id, pipeline_id, stage_id, status, amount,
    executivo_user_id, owner_user_id, sdr_user_id, fonte, campanha, tipo_venda,
    agendado_em, reuniao_em
  ) VALUES (
    COALESCE(NULLIF(trim(_nome), ''), v_empresa_nome),
    v_company, l.contact_id, v_pipeline, v_stage, 'open', COALESCE(_valor, 0),
    _executivo, _executivo, l.assigned_to, l.source, l.campaign,
    CASE WHEN v_cliente THEN 'Recompra' ELSE 'Cliente novo' END,
    now(), l.meeting_at
  ) RETURNING id INTO v_deal;

  IF l.contact_id IS NOT NULL THEN
    INSERT INTO public.deal_contacts (deal_id, contact_id, principal)
    VALUES (v_deal, l.contact_id, true) ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.leads
     SET deal_id = v_deal, company_id = v_company, executivo_id = COALESCE(executivo_id, _executivo)
   WHERE id = _lead;

  INSERT INTO public.deal_activities (deal_id, tipo, descricao, author_id)
  VALUES (v_deal, 'nota', 'Negócio criado na passagem do SDR para o executivo.', auth.uid());

  RETURN v_deal;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.passar_lead_para_executivo(uuid, uuid, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.passar_lead_para_executivo(uuid, uuid, text, numeric) TO authenticated, service_role;
