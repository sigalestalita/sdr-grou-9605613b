-- Jornada de ponta a ponta: fecha a ponte SDR -> Comercial e semeia um exemplo.
--
-- Ao montar a visão de ponta a ponta apareceu um buraco no modelo: o lead do
-- SDR não apontava para a empresa nem para o negócio que ele virou. Quer dizer
-- que, na prática, o bastão do SDR para o comercial não existia no dado — ele
-- só existia na cabeça das pessoas, que é exatamente o que a gestora comercial
-- disse que precisa acabar.
--
-- Aqui a ponte é criada e um cliente de exemplo percorre o ciclo inteiro:
-- entra como lead, é qualificado, tem agenda marcada, vira negócio, recebe
-- ordem de compra, passa pelo ADM, é faturado e chega ao CS com a jornada
-- começando. Tudo marcado como exemplo, para poder ser removido de uma vez.

-- ---------------------------------------------------------------------------
-- 1. A ponte que faltava
-- ---------------------------------------------------------------------------
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS company_id uuid
  REFERENCES public.companies(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS deal_id uuid
  REFERENCES public.deals(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.leads.deal_id IS
  'Negócio que este lead virou quando o SDR passou o bastão para o comercial.';

CREATE INDEX IF NOT EXISTS idx_leads_company ON public.leads (company_id)
  WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deals_company_status ON public.deals (company_id, status);

-- Marca o exemplo para dar para achar e apagar depois.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS exemplo boolean NOT NULL DEFAULT false;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS exemplo boolean NOT NULL DEFAULT false;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS exemplo boolean NOT NULL DEFAULT false;
ALTER TABLE public.cs_clients ADD COLUMN IF NOT EXISTS exemplo boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 2. O exemplo: Nova Aurora Alimentos
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_company uuid;
  v_deal uuid;
  v_lead uuid;
  v_client text;
  v_sdr uuid;
  v_exec uuid;
  v_cs uuid;
  v_pipeline uuid;
  v_stage_venda uuid;
  v_stage_lead uuid;
  v_hoje date := current_date;
  -- o ciclo inteiro comprimido em 60 dias, terminando hoje
  v_entrada timestamptz := now() - interval '60 days';
BEGIN
  -- Já existe? Então a migration já rodou.
  SELECT id INTO v_company FROM public.companies WHERE uid = 'exemplo-nova-aurora';
  IF v_company IS NOT NULL THEN
    RAISE NOTICE 'Exemplo já existe, nada a fazer.';
    RETURN;
  END IF;

  -- Pessoas reais da base, quando houver: SDR, executivo e analista de CS.
  SELECT user_id INTO v_sdr FROM public.user_roles WHERE role = 'sdr' LIMIT 1;
  SELECT user_id INTO v_exec FROM public.user_roles WHERE role = 'executivo' LIMIT 1;
  SELECT cs_responsavel_id INTO v_cs FROM public.cs_clients
   WHERE cs_responsavel_id IS NOT NULL LIMIT 1;

  SELECT id INTO v_pipeline FROM public.pipelines WHERE slug = 'novos-negocios';
  SELECT id INTO v_stage_venda FROM public.pipeline_stages
   WHERE pipeline_id = v_pipeline AND slug = 'venda';
  SELECT id INTO v_stage_lead FROM public.stages WHERE slug = 'comercial';

  -- ---- empresa (a entidade que os três módulos compartilham) ----
  INSERT INTO public.companies (uid, nome, cnpj, segmento, porte, num_funcionarios,
                                cidade, estado, site_url, tipo_lead, lifecycle, exemplo)
  VALUES ('exemplo-nova-aurora', 'Nova Aurora Alimentos (exemplo)', '12345678000199',
          'Indústria de alimentos', 'medio', 180, 'Joinville', 'SC',
          'https://exemplo.novaaurora.com.br', 'empresa', 'cliente', true)
  RETURNING id INTO v_company;

  -- ---- negócio no comercial, com o ciclo de fechamento completo ----
  INSERT INTO public.deals (
    nome, company_id, executivo_user_id, sdr_user_id, pipeline_id, stage_id,
    status, amount, temperatura, fonte, campanha, tipo_venda,
    agendado_em, reuniao_em, devolutiva_em,
    proposta_aceita_em, ordem_compra_em, ordem_compra_numero, contrato_assinado_em,
    adm_checked_at, faturado_em, cs_entregue_em, closed_at,
    observacao_adm, exemplo
  ) VALUES (
    'PDA Assessment — Nova Aurora (exemplo)', v_company, v_exec, v_sdr,
    v_pipeline, v_stage_venda, 'won', 18500, 'quente',
    'Formulário do site', 'PDA Assessment', 'Serviço',
    v_entrada + interval '6 days',   -- agenda marcada pelo SDR
    v_entrada + interval '11 days',  -- reunião com o executivo
    v_entrada + interval '13 days',  -- devolutiva
    v_entrada + interval '27 days',  -- proposta aceita
    v_entrada + interval '34 days',  -- ORDEM DE COMPRA: é isto que conta como venda
    'OC-2026-0431',
    v_entrada + interval '33 days',
    v_entrada + interval '36 days',  -- ADM deu o check
    v_entrada + interval '38 days',  -- faturado
    v_entrada + interval '40 days',  -- entregue ao CS
    v_entrada + interval '34 days',
    'Fechado o PDA Assessment para 180 colaboradores, com 2 workshops de devolutiva. '
    || 'Contato principal é a gerente de RH. A diretoria quer o resultado antes do ciclo '
    || 'de avaliação de desempenho, que começa em março. Pagamento em 3 parcelas.',
    true
  ) RETURNING id INTO v_deal;

  -- ---- lead no SDR, ligado à empresa e ao negócio ----
  INSERT INTO public.leads (
    name, email, phone, company_name, position, source, channel, campaign, form_name,
    stage_id, priority, score, lead_type, assigned_to, executivo_id,
    company_id, deal_id, company_segment, company_size, linkedin_company_size,
    created_at, first_approach_at, converted_at, meeting_at, meeting_booked_at,
    stage_entered_at, last_touch_at, touch_count, bant, probable_pain, exemplo
  ) VALUES (
    'Renata Sobral (exemplo)', 'renata.sobral@exemplo.novaaurora.com.br', '5547999990000',
    'Nova Aurora Alimentos (exemplo)', 'Gerente de RH', 'Formulário do site', 'inbound',
    'PDA Assessment', 'Quero conhecer o PDA',
    v_stage_lead, 'alta', 82, 'empresa', v_sdr, v_exec,
    v_company, v_deal, 'Indústria de alimentos', '101-250', '101-250',
    v_entrada,
    v_entrada + interval '18 minutes',  -- 1º toque dentro do SLA de 15 min? quase
    v_entrada,
    v_entrada + interval '11 days',
    v_entrada + interval '6 days',
    v_entrada + interval '14 days',
    v_entrada + interval '13 days',
    5,
    jsonb_build_object(
      'budget',    jsonb_build_object('status','ok','notes','Orçamento aprovado para o ciclo de 2026.'),
      'authority', jsonb_build_object('status','ok','notes','Diretora de Gente decide; a gerente de RH conduz.'),
      'need',      jsonb_build_object('status','ok','notes','Turnover alto na liderança de produção.'),
      'timeline',  jsonb_build_object('status','parcial','notes','Querem o resultado antes do ciclo de avaliação, em março.'),
      'summary',   'Indústria com 180 colaboradores e dor clara em liderança de produção. Decisão compartilhada entre RH e diretoria.'
    ),
    'Turnover na liderança de produção e falta de critério para promover',
    true
  ) RETURNING id INTO v_lead;

  -- ---- cliente no CS, jornada começando ----
  INSERT INTO public.cs_clients (
    client_uid, nome_empresa, cnpj, company_id, tipo_lead, origem, aporte_valor,
    cs_responsavel_id, comercial_responsavel_id,
    data_inicio_contrato, data_renovacao, journey_stage, stage_entered_at,
    setor, site_url, num_funcionarios, porte, current_signal, health_score,
    last_contact_at, ativo, exemplo
  ) VALUES (
    'EXEMPLO-NOVA-AURORA', 'Nova Aurora Alimentos (exemplo)', '12345678000199',
    v_company, 'empresa', 'marketing', 18500,
    v_cs, v_exec,
    (v_entrada + interval '40 days')::date,
    ((v_entrada + interval '40 days') + interval '10 months')::date,
    'onboarding', v_entrada + interval '40 days',
    'Indústria de alimentos', 'https://exemplo.novaaurora.com.br', 180, 'medio',
    'verde', 78,
    now() - interval '5 days', true, true
  );

  -- ---- linha do tempo do CS: o atendimento rodando ----
  INSERT INTO public.cs_timeline_events (client_uid, event_type, channel, title, description, author_id, occurred_at)
  VALUES
    ('EXEMPLO-NOVA-AURORA', 'nota', NULL, 'Cliente recebido do comercial',
     'Bastão passado pelo ADM após o faturamento. Briefing do comercial registrado no negócio.',
     v_cs, v_entrada + interval '40 days'),
    ('EXEMPLO-NOVA-AURORA', 'contato', 'email', 'E-mail de boas-vindas enviado',
     'Apresentação da analista responsável e convite para a reunião de kickoff.',
     v_cs, v_entrada + interval '41 days'),
    ('EXEMPLO-NOVA-AURORA', 'reuniao', 'reuniao', 'Kickoff de onboarding',
     'Alinhamento do cronograma de aplicação do PDA e definição dos gestores que recebem a devolutiva.',
     v_cs, v_entrada + interval '46 days'),
    ('EXEMPLO-NOVA-AURORA', 'contato', 'whatsapp', 'Acompanhamento da aplicação',
     'Confirmado o envio dos convites para os 180 colaboradores. 62% já responderam.',
     v_cs, now() - interval '5 days');

  RAISE NOTICE 'Exemplo criado: empresa %, negócio %, lead %', v_company, v_deal, v_lead;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Como remover o exemplo
-- ---------------------------------------------------------------------------
-- DELETE FROM public.cs_timeline_events WHERE client_uid = 'EXEMPLO-NOVA-AURORA';
-- DELETE FROM public.cs_clients WHERE exemplo;
-- DELETE FROM public.leads WHERE exemplo;
-- DELETE FROM public.deals WHERE exemplo;
-- DELETE FROM public.companies WHERE exemplo;
