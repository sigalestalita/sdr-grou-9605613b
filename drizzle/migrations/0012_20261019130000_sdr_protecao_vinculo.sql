-- Proteger o uso atual do SDR (complemento da espinha, 20261019100000).
--
-- * Ligar o lead a contato/empresa é acessório: uma falha nunca pode impedir
--   o SDR de salvar o lead nem travar importação; o cron tenta de novo e
--   segue com os outros leads.
-- * Reagendar a reunião atualiza a data no negócio criado na passagem.

CREATE OR REPLACE FUNCTION public.leads_vincula()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Ligar a contato/empresa é acessório: nunca pode impedir o SDR de salvar
  -- o lead nem travar uma importação. Falhou, fica para o cron tentar de novo.
  BEGIN
    PERFORM public.vincular_lead(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'vincular_lead(%): %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.vincular_leads_pendentes(_limite integer DEFAULT 1000)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r record; n integer := 0;
BEGIN
  FOR r IN SELECT id FROM public.leads WHERE contact_id IS NULL
            ORDER BY created_at DESC LIMIT LEAST(GREATEST(_limite, 1), 5000) LOOP
    BEGIN
      PERFORM public.vincular_lead(r.id);
      n := n + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'vincular_lead(%): %', r.id, SQLERRM;
    END;
  END LOOP;
  RETURN n;
END;
$$;

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
    -- Reagendamento: o negócio acompanha a data da reunião do lead.
    UPDATE public.deals SET executivo_user_id = COALESCE(executivo_user_id, _executivo),
                            reuniao_em = COALESCE(l.meeting_at, reuniao_em)
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

