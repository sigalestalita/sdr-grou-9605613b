-- Uma sinalização do CS viva, para o fluxo novo ter instância no kanban.
--
-- O exemplo do Maicon (20260914170000) é uma história já terminada: as duas
-- vendas estão ganhas, e o kanban do funil mostra o que está aberto. Então o
-- fluxo "o CS sinaliza e o card cai no funil do executivo" não tinha nenhum
-- caso visível — só dava para ver depois de sinalizar algo à mão.
--
-- Aqui a mesma conta gera a segunda sinalização, catorze meses depois da
-- entrega: os créditos de PDA estão acabando. Isso é RECOMPRA, mais do mesmo,
-- então o card nasce em UP SELL – Recompra, na etapa "Selecionados", no nome
-- do responsável comercial da conta — exatamente o que o código faz hoje.

DO $$
DECLARE
  v_client text := 'EXEMPLO-VALE-NORTE';
  v_company uuid;
  v_maicon uuid;
  v_cs uuid;
  v_pipe uuid;
  v_stage uuid;
  v_deal uuid;
  v_op uuid;
  v_quando timestamptz := now() - interval '3 days';
BEGIN
  SELECT company_id, comercial_responsavel_id, cs_responsavel_id
    INTO v_company, v_maicon, v_cs
    FROM public.cs_clients WHERE client_uid = v_client;

  IF v_company IS NULL THEN
    RAISE NOTICE 'Sem o exemplo da Vale Norte na base; nada a fazer.';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.cs_oportunidades
     WHERE client_uid = v_client AND tipo = 'recompra'
  ) THEN
    RAISE NOTICE 'Sinalização de recompra já existe.';
    RETURN;
  END IF;

  SELECT id INTO v_pipe FROM public.pipelines WHERE slug = 'up-sell-recompra';
  SELECT id INTO v_stage FROM public.pipeline_stages
   WHERE pipeline_id = v_pipe AND slug = 'selecionados';

  -- O card, do jeito que sinalizarOportunidade() cria: primeira etapa aberta,
  -- no nome do responsável comercial, com o valor que o analista estimou.
  INSERT INTO public.deals (
    nome, company_id, executivo_user_id, pipeline_id, stage_id,
    status, amount, temperatura, fonte, tipo_venda, produtos_texto,
    proximo_passo, proximo_passo_em, created_at, updated_at, exemplo
  ) VALUES (
    'Recompra de créditos PDA — Metalúrgica Vale Norte (exemplo)',
    v_company, v_maicon, v_pipe, v_stage,
    'open', 22000, 'morno', 'Sinalização do CS', 'Recompra',
    'PDA Assessment — pacote de créditos',
    'Ligar para a gerente de RH e levantar quantos assessments vão precisar no próximo ciclo.',
    v_quando + interval '5 days',
    v_quando, v_quando, true
  ) RETURNING id INTO v_deal;

  INSERT INTO public.cs_oportunidades (
    client_uid, tipo, motivo, produto_sugerido, valor_estimado,
    status, sinalizada_por, sinalizada_em, assumida_por, assumida_em, deal_id
  ) VALUES (
    v_client, 'recompra',
    'Restam 40 créditos de PDA e o RH já falou em mapear a supervisão inteira no '
    || 'próximo ciclo. São cerca de 120 pessoas. Vale abrir a conversa agora, antes '
    || 'de os créditos zerarem no meio do processo.',
    'PDA Assessment — pacote de créditos', 22000,
    'assumida', v_cs, v_quando, v_maicon, v_quando, v_deal
  ) RETURNING id INTO v_op;

  -- O contexto do CS abre o histórico do negócio, como no fluxo real.
  INSERT INTO public.deal_activities (deal_id, tipo, descricao, author_id, occurred_at)
  VALUES (
    v_deal, 'nota',
    'Oportunidade sinalizada pelo CS: restam 40 créditos de PDA e o RH quer mapear '
    || 'a supervisão inteira (~120 pessoas) no próximo ciclo.',
    v_cs, v_quando
  );

  -- E fica registrado na linha do tempo do cliente, do lado do CS.
  INSERT INTO public.cs_timeline_events (client_uid, author_id, event_type, title, description, occurred_at)
  VALUES (
    v_client, v_cs, 'nota',
    'Oportunidade sinalizada ao comercial (recompra)',
    'Créditos de PDA acabando e intenção de mapear a supervisão. Card aberto em UP SELL – Recompra.',
    v_quando
  );

  RAISE NOTICE 'Sinalização aberta criada: oportunidade % / negócio %', v_op, v_deal;
END $$;

-- Para remover:
--   DELETE FROM public.deals WHERE nome LIKE 'Recompra de créditos PDA — Metalúrgica Vale Norte%';
--   DELETE FROM public.cs_oportunidades WHERE client_uid = 'EXEMPLO-VALE-NORTE' AND tipo = 'recompra';
