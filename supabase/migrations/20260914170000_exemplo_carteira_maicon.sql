-- Exemplo da carteira: da venda nova ao cross sell, 14 meses depois.
--
-- Percorre o caminho inteiro que o módulo comercial agora suporta:
--   1. Maicon fecha um negócio novo de empresa grande, R$ 40.500, vindo de
--      SDR/marketing. Ordem de compra, ADM, faturamento e entrega ao CS.
--   2. Catorze meses depois, numa agenda do CS, o cliente diz que quer o
--      Master Líder. O analista sinaliza a oportunidade.
--   3. Maicon assume, entra em contato e fecha por R$ 104.400.
--
-- O funil do segundo negócio é o CROSS SELL, e não o de recompra: Master Líder
-- é serviço que o cliente ainda não tinha. Recompra seria mais do mesmo.

DO $$
DECLARE
  v_company uuid;
  v_deal1 uuid;
  v_deal2 uuid;
  v_client text := 'EXEMPLO-VALE-NORTE';
  v_maicon uuid;
  v_cs uuid;
  v_sdr uuid;
  v_pipe_novos uuid;
  v_pipe_cross uuid;
  v_stage_venda_novos uuid;
  v_stage_venda_cross uuid;
  v_op uuid;
  -- âncora: o ciclo começa 16 meses atrás e termina agora
  v_inicio timestamptz := now() - interval '16 months';
  v_entrega timestamptz;
  v_sinal timestamptz;
BEGIN
  SELECT id INTO v_company FROM public.companies WHERE uid = 'exemplo-vale-norte';
  IF v_company IS NOT NULL THEN
    RAISE NOTICE 'Exemplo da carteira já existe.';
    RETURN;
  END IF;

  -- Maicon; sem ele na base, qualquer executivo serve para o exemplo rodar.
  SELECT id INTO v_maicon FROM public.profiles WHERE full_name ILIKE '%maicon%' LIMIT 1;
  IF v_maicon IS NULL THEN
    SELECT user_id INTO v_maicon FROM public.user_roles WHERE role = 'executivo' LIMIT 1;
  END IF;
  SELECT cs_responsavel_id INTO v_cs FROM public.cs_clients
   WHERE cs_responsavel_id IS NOT NULL LIMIT 1;
  SELECT user_id INTO v_sdr FROM public.user_roles WHERE role = 'sdr' LIMIT 1;

  SELECT id INTO v_pipe_novos FROM public.pipelines WHERE slug = 'novos-negocios';
  SELECT id INTO v_pipe_cross FROM public.pipelines WHERE slug = 'cross-sell-cliente';
  SELECT id INTO v_stage_venda_novos FROM public.pipeline_stages
   WHERE pipeline_id = v_pipe_novos AND slug = 'venda';
  SELECT id INTO v_stage_venda_cross FROM public.pipeline_stages
   WHERE pipeline_id = v_pipe_cross AND slug = 'venda';

  v_entrega := v_inicio + interval '47 days';
  v_sinal := v_entrega + interval '14 months';

  -- ---- empresa ----
  INSERT INTO public.companies (uid, nome, cnpj, segmento, porte, num_funcionarios,
                                cidade, estado, tipo_lead, lifecycle, exemplo)
  VALUES ('exemplo-vale-norte', 'Metalúrgica Vale Norte (exemplo)', '98765432000155',
          'Metalurgia', 'grande', 820, 'Caxias do Sul', 'RS', 'empresa', 'cliente', true)
  RETURNING id INTO v_company;

  -- ---- 1. negócio novo ----
  INSERT INTO public.deals (
    nome, company_id, executivo_user_id, sdr_user_id, pipeline_id, stage_id,
    status, amount, temperatura, fonte, campanha, tipo_venda,
    agendado_em, reuniao_em, devolutiva_em, proposta_aceita_em,
    ordem_compra_em, ordem_compra_numero, contrato_assinado_em,
    adm_checked_at, faturado_em, cs_entregue_em, closed_at,
    produtos_texto, observacao_adm, exemplo
  ) VALUES (
    'PDA Assessment — Metalúrgica Vale Norte (exemplo)', v_company, v_maicon, v_sdr,
    v_pipe_novos, v_stage_venda_novos, 'won', 40500, 'quente',
    'SDR / Marketing', 'PDA Assessment', 'Serviço',
    v_inicio + interval '5 days',
    v_inicio + interval '9 days',
    v_inicio + interval '12 days',
    v_inicio + interval '30 days',
    v_inicio + interval '38 days', 'OC-2025-0912',
    v_inicio + interval '37 days',
    v_inicio + interval '41 days',
    v_inicio + interval '44 days',
    v_entrega,
    v_inicio + interval '38 days',
    'PDA Assessment — 820 colaboradores',
    'Mapeamento comportamental de 820 pessoas, com devolutiva para 40 líderes. '
    || 'Contato principal é a gerente de Desenvolvimento. Diretoria industrial patrocina. '
    || 'Pagamento em 4 parcelas.',
    true
  ) RETURNING id INTO v_deal1;

  INSERT INTO public.deal_activities (deal_id, tipo, descricao, author_id, occurred_at) VALUES
    (v_deal1, 'reuniao', 'Reunião de apresentação do PDA com RH e diretoria industrial.',
     v_maicon, v_inicio + interval '9 days'),
    (v_deal1, 'proposta', 'Proposta enviada para 820 colaboradores, com devolutiva de líderes.',
     v_maicon, v_inicio + interval '20 days'),
    (v_deal1, 'nota', 'Venda ganha — ordem de compra OC-2025-0912. Segue para o ADM.',
     v_maicon, v_inicio + interval '38 days');

  -- ---- cliente no CS ----
  INSERT INTO public.cs_clients (
    client_uid, nome_empresa, cnpj, company_id, tipo_lead, origem, aporte_valor,
    cs_responsavel_id, comercial_responsavel_id,
    data_inicio_contrato, data_renovacao, journey_stage, stage_entered_at,
    setor, num_funcionarios, porte, current_signal, health_score,
    last_contact_at, ativo, exemplo
  ) VALUES (
    v_client, 'Metalúrgica Vale Norte (exemplo)', '98765432000155',
    v_company, 'empresa', 'marketing', 40500,
    v_cs, v_maicon,
    v_entrega::date, (v_entrega + interval '10 months')::date,
    'renovacao', v_sinal,
    'Metalurgia', 820, 'grande', 'verde', 82,
    v_sinal, true, true
  );

  -- ---- 2. a agenda do CS onde a oportunidade aparece ----
  INSERT INTO public.cs_timeline_events (client_uid, event_type, channel, title, description, author_id, occurred_at)
  VALUES
    (v_client, 'nota', NULL, 'Cliente recebido do comercial',
     'Bastão passado pelo ADM após o faturamento.', v_cs, v_entrega),
    (v_client, 'reuniao', 'reuniao', 'Reunião de acompanhamento',
     'Cliente relatou dificuldade em formar a liderança de turno e perguntou se a Grou tem '
     || 'algo específico para desenvolvimento de líderes. Apresentado o Master Líder.',
     v_cs, v_sinal),
    (v_client, 'nota', NULL, 'Oportunidade sinalizada ao comercial (cross sell)',
     'Interesse no Master Líder para 40 líderes de turno, levantado na reunião de acompanhamento.',
     v_cs, v_sinal + interval '1 hour');

  -- ---- 3. sinalização do CS ----
  INSERT INTO public.cs_oportunidades (
    client_uid, tipo, motivo, produto_sugerido, valor_estimado,
    status, sinalizada_por, sinalizada_em, assumida_por, assumida_em
  ) VALUES (
    v_client, 'cross_sell',
    'Na reunião de acompanhamento o cliente pediu algo para desenvolver a liderança de turno. '
    || 'São 40 líderes. Não usa nada da Grou nessa frente hoje.',
    'Master Líder', 100000,
    'assumida', v_cs, v_sinal + interval '1 hour', v_maicon, v_sinal + interval '2 days'
  ) RETURNING id INTO v_op;

  -- ---- 4. o cross sell que o Maicon fechou ----
  INSERT INTO public.deals (
    nome, company_id, executivo_user_id, pipeline_id, stage_id,
    status, amount, temperatura, fonte, tipo_venda,
    reuniao_em, proposta_aceita_em, ordem_compra_em, ordem_compra_numero,
    closed_at, produtos_texto, observacao_adm, exemplo
  ) VALUES (
    'Master Líder — Metalúrgica Vale Norte (exemplo)', v_company, v_maicon,
    v_pipe_cross, v_stage_venda_cross, 'won', 104400, 'quente',
    'Sinalização do CS', 'Cross sell',
    v_sinal + interval '9 days',
    v_sinal + interval '24 days',
    v_sinal + interval '31 days', 'OC-2026-0433',
    v_sinal + interval '31 days',
    'Master Líder — 40 líderes de turno',
    'Cross sell vindo do CS. Turma fechada de 40 líderes, em 6 encontros. '
    || 'A gerente de Desenvolvimento segue como contato.',
    true
  ) RETURNING id INTO v_deal2;

  UPDATE public.cs_oportunidades SET deal_id = v_deal2 WHERE id = v_op;

  INSERT INTO public.deal_activities (deal_id, tipo, descricao, author_id, occurred_at) VALUES
    (v_deal2, 'nota', 'Oportunidade sinalizada pelo CS: interesse no Master Líder para 40 líderes de turno.',
     v_maicon, v_sinal + interval '2 days'),
    (v_deal2, 'ligacao', 'Liguei para a gerente de Desenvolvimento. Confirmou o interesse e pediu '
     || 'uma apresentação para a diretoria industrial.', v_maicon, v_sinal + interval '3 days'),
    (v_deal2, 'reuniao', 'Apresentação do Master Líder para RH e diretoria industrial.',
     v_maicon, v_sinal + interval '9 days'),
    (v_deal2, 'proposta', 'Proposta enviada: turma fechada de 40 líderes, 6 encontros.',
     v_maicon, v_sinal + interval '16 days'),
    (v_deal2, 'nota', 'Venda ganha — ordem de compra OC-2026-0433. Segue para o ADM.',
     v_maicon, v_sinal + interval '31 days');

  RAISE NOTICE 'Exemplo da carteira criado: novo % e cross sell %', v_deal1, v_deal2;
END $$;

-- Para remover:
-- DELETE FROM public.cs_oportunidades WHERE client_uid = 'EXEMPLO-VALE-NORTE';
-- DELETE FROM public.cs_timeline_events WHERE client_uid = 'EXEMPLO-VALE-NORTE';
-- DELETE FROM public.cs_clients WHERE client_uid = 'EXEMPLO-VALE-NORTE';
-- DELETE FROM public.deals WHERE company_id = (SELECT id FROM public.companies WHERE uid = 'exemplo-vale-norte');
-- DELETE FROM public.companies WHERE uid = 'exemplo-vale-norte';
