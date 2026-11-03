-- Catálogo completado com a Tabela de Preço Grou 2026 (atualizada em 05/01/2026).
-- Preenche os preços que faltavam, cria os itens da tabela que não existiam
-- e desativa os itens antigos do RD sem marca nem tipo (continuam nos
-- negócios antigos, só saem da lista de escolha).

-- 1) Preços que faltavam em itens existentes
UPDATE public.products SET preco_tabela = v.preco, updated_at = now()
FROM (VALUES
  ('RELATÓRIO DE TENDÊNCIAS', 1572.00),
  ('ENTREGA DE PROJETO', 1572.00),
  ('HORA CONSULTORIA', 821.00),
  ('MENTORIA COMPORTAMENTAL', 385.00),
  ('WS LÍDER 360', 10879.00),
  ('WS NR1', 9620.00)
) AS v(nome, preco)
WHERE products.nome = v.nome AND products.marca IS NOT NULL AND (products.preco_tabela IS NULL OR products.preco_tabela = 0);

UPDATE public.products SET nome = 'DASHBOARD ATÉ 10 PESSOAS', preco_tabela = 3177.00, updated_at = now()
WHERE nome = 'DASHBOARD' AND marca = 'PDA';

UPDATE public.products SET descricao = 'Mentoria comportamental: valor por liderado (média 30 min). O líder precisa ter recebido a devolutiva de PDA.'
WHERE nome = 'MENTORIA COMPORTAMENTAL' AND marca = 'PDA';
UPDATE public.products SET descricao = 'Turma de até 20 pessoas (5 módulos de 2h, 10h). Por líder: R$ 543,95.'
WHERE nome = 'WS LÍDER 360' AND marca = 'PDA';
UPDATE public.products SET descricao = 'Turma de até 20 pessoas (3 encontros de 2h, 6h). Por líder: R$ 481,00.'
WHERE nome = 'WS NR1' AND marca = 'PDA';

-- 2) Itens novos da tabela 2026
INSERT INTO public.products (nome, marca, tipo, subcategoria, preco_tabela, parcelamento_max, classificacao_fiscal, descricao, ativo, ordem)
SELECT v.nome, v.marca, v.tipo, v.sub, v.preco, v.parc, v.classe, v.descr, true, v.ordem
FROM (VALUES
  -- Partner Diamante
  ('LICENÇA DIAMANTE 350',   'PDA','produto','Partner', 27382.00, 5::smallint, 'licenciamento', '350 créditos · R$ 78,23 por crédito', 300),
  ('LICENÇA DIAMANTE 500',   'PDA','produto','Partner', 35805.00, 5::smallint, 'licenciamento', '500 créditos · R$ 71,61 por crédito', 301),
  ('LICENÇA DIAMANTE 750',   'PDA','produto','Partner', 49299.00, 5::smallint, 'licenciamento', '750 créditos · R$ 65,73 por crédito', 302),
  ('LICENÇA DIAMANTE 1.000', 'PDA','produto','Partner', 50566.00, 6::smallint, 'licenciamento', '1.000 créditos · R$ 50,57 por crédito', 303),
  ('LICENÇA DIAMANTE 2.000', 'PDA','produto','Partner', 60302.00, 6::smallint, 'licenciamento', '2.000 créditos · R$ 30,15 por crédito', 304),
  ('LICENÇA DIAMANTE 3.000', 'PDA','produto','Partner', 72349.00, 6::smallint, 'licenciamento', '3.000 créditos · R$ 24,12 por crédito', 305),
  ('LICENÇA DIAMANTE 4.000', 'PDA','produto','Partner', 86810.00, 6::smallint, 'licenciamento', '4.000 créditos · R$ 21,70 por crédito', 306),
  ('PACOTE 10 - LIC. DIAMANTE 350',   'PDA','produto','Partner (pacote 10)', 782.34, NULL, 'licenciamento', NULL, 310),
  ('PACOTE 10 - LIC. DIAMANTE 500',   'PDA','produto','Partner (pacote 10)', 716.10, NULL, 'licenciamento', NULL, 311),
  ('PACOTE 10 - LIC. DIAMANTE 750',   'PDA','produto','Partner (pacote 10)', 657.32, NULL, 'licenciamento', NULL, 312),
  ('PACOTE 10 - LIC. DIAMANTE 1.000', 'PDA','produto','Partner (pacote 10)', 505.66, NULL, 'licenciamento', NULL, 313),
  ('PACOTE 10 - LIC. DIAMANTE 2.000', 'PDA','produto','Partner (pacote 10)', 301.51, NULL, 'licenciamento', NULL, 314),
  ('PACOTE 10 - LIC. DIAMANTE 3.000', 'PDA','produto','Partner (pacote 10)', 241.16, NULL, 'licenciamento', NULL, 315),
  ('PACOTE 10 - LIC. DIAMANTE 4.000', 'PDA','produto','Partner (pacote 10)', 217.03, NULL, 'licenciamento', NULL, 316),
  -- Créditos PDA Bronze (sem plataforma é o PDA AVULSO)
  ('CRÉDITO BRONZE 01 A 04', 'PDA','produto','Crédito', 146.00, NULL, 'licenciamento', 'Valor por crédito', 320),
  ('CRÉDITO BRONZE 05 A 09', 'PDA','produto','Crédito', 132.00, NULL, 'licenciamento', 'Valor por crédito', 321),
  ('CRÉDITO BRONZE ATÉ 10',  'PDA','produto','Crédito', 121.00, NULL, 'licenciamento', 'Valor por crédito; acima de 10, Licença Prata', 322),
  -- Talogy Prime
  ('CRÉDITO DG PRIME', 'Talogy','produto','Crédito', 159.20, NULL, 'licenciamento', 'Dilemas, 1 a 1.000 créditos, preço Prime', 330),
  ('CRÉDITO QR PRIME', 'Talogy','produto','Crédito', 318.40, NULL, 'licenciamento', 'Resiliência, 1 a 1.000 créditos, preço Prime', 331),
  -- Certificações
  ('CERTI PDA IN COMPANY PRESENCIAL', 'PDA','servico','Certificação in company', 13558.00, NULL, 'treinamento', '12h, turma de 1 a 15 pessoas (máx. 20)', 340),
  ('CERTIFICAÇÃO PDA ESPANHOL', 'PDA','servico','Certificação aberta', 1758.00, NULL, 'suporte', '12h, por pessoa, turma via PDA International', 341),
  ('CERTIFICAÇÃO PDA INGLÊS',   'PDA','servico','Certificação aberta', 1758.00, NULL, 'suporte', '12h, por pessoa, turma via PDA International', 342),
  ('COMBO CERTIFICAÇÃO PDA + ENTREVISTA POR COMPETÊNCIA', 'PDA','servico','Certificação aberta', 2000.00, NULL, 'suporte', '9h + 3h, por pessoa', 343),
  -- Devolutivas, FB 360 e PDA Insight
  ('DEVOLUTIVA INDIVIDUAL 50 A 99 - 1H',   'PDA','servico','Devolutiva', 623.00, NULL, 'treinamento', 'Valor por devolutiva', 350),
  ('DEVOLUTIVA INDIVIDUAL ACIMA DE 100 - 1H','PDA','servico','Devolutiva', 591.00, NULL, 'treinamento', 'Valor por devolutiva', 351),
  ('DEVOLUTIVA INDIVIDUAL ESPANHOL/INGLÊS - 1H','PDA','servico','Devolutiva', 913.00, NULL, 'treinamento', 'Valor por devolutiva', 352),
  ('DEVOLUTIVA FB 360 - 01 A 50',          'PDA','servico','Devolutiva', 965.00, NULL, 'treinamento', '1h30 por devolutiva', 353),
  ('DEVOLUTIVA FB 360 - 50 A 99',          'PDA','servico','Devolutiva', 876.00, NULL, 'treinamento', '1h30 por devolutiva', 354),
  ('DEVOLUTIVA FB 360 - ACIMA DE 100',     'PDA','servico','Devolutiva', 823.00, NULL, 'treinamento', '1h30 por devolutiva', 355),
  ('DEVOLUTIVA FB 360 - ESPANHOL/INGLÊS',  'PDA','servico','Devolutiva', 1207.00, NULL, 'treinamento', '1h30 por devolutiva', 356),
  ('PDA INSIGHT - 01 A 50',      'PDA','servico','Devolutiva', 1033.00, NULL, 'treinamento', 'Devolutiva de 1h + reunião de entrega com o contratante; sem relatório', 357),
  ('PDA INSIGHT - 50 A 99',      'PDA','servico','Devolutiva', 927.00, NULL, 'treinamento', 'Devolutiva de 1h + reunião de entrega com o contratante; sem relatório', 358),
  ('PDA INSIGHT - ACIMA DE 100', 'PDA','servico','Devolutiva', 873.00, NULL, 'treinamento', 'Devolutiva de 1h + reunião de entrega com o contratante; sem relatório', 359),
  -- Entregas e consultoria
  ('ENTREGA DE RELATÓRIOS INDIVIDUAL', 'PDA','servico','Consultoria', 821.00, NULL, 'treinamento', '1h, um para um', 360),
  ('ENTREGA DE RELATÓRIOS GRUPO',      'PDA','servico','Consultoria', 1572.00, NULL, 'treinamento', '1h, um para mais', 361),
  ('KICK-OFF', 'PDA','servico','Consultoria', 0.00, NULL, 'treinamento', '30 ou 45 min, sem custo', 362),
  ('CUSTOMIZAÇÃO DE COMPETÊNCIAS', 'PDA','servico','Consultoria', 2805.00, NULL, 'treinamento', NULL, 363),
  -- Workshops e programas
  ('WS ENTREVISTA POR COMPETÊNCIAS', 'PDA','servico','Workshop', 5280.00, NULL, 'treinamento', '3h, até 20 pessoas', 370),
  ('WS ENTREVISTA POR COMPETÊNCIAS INDIVIDUAL', 'PDA','servico','Workshop', 548.00, NULL, 'treinamento', '3h, individual', 371),
  ('LÍDER 360 INDIVIDUAL', 'PDA','servico','Workshop', 1598.00, NULL, 'treinamento', '5 módulos de 2h (10h), por líder', 372),
  ('NR1 LIDERANÇA INDIVIDUAL', 'PDA','servico','Workshop', 798.00, NULL, 'treinamento', '3 encontros de 2h (6h), por líder', 373),
  ('BÚSSOLA - ETAPA 1 (TOV E DEVOLUTIVA)', 'PDA','servico','Programa', 498.00, NULL, 'treinamento', 'Por pessoa', 374),
  ('BÚSSOLA - ETAPA 2 (4 ENCONTROS)', 'PDA','servico','Programa', 1992.00, NULL, 'treinamento', 'Por pessoa', 375),
  -- Dashboard
  ('DASHBOARD 11 A 25 PESSOAS', 'PDA','servico','Assessment', 4448.00, NULL, 'treinamento', NULL, 380),
  ('DASHBOARD 25 A 50 PESSOAS', 'PDA','servico','Assessment', 5718.00, NULL, 'treinamento', NULL, 381),
  ('DASHBOARD ACIMA DE 50 PESSOAS', 'PDA','servico','Assessment', 6988.00, NULL, 'treinamento', NULL, 382),
  -- Pesquisas
  ('PESQUISA DE CLIMA ATÉ 100',        'PDA','servico','Pesquisa', 3000.00, NULL, 'treinamento', 'Modelo Grou; relatório final único', 390),
  ('PESQUISA DE CLIMA 100 A 300',      'PDA','servico','Pesquisa', 5000.00, NULL, 'treinamento', 'Modelo Grou; relatório final único', 391),
  ('PESQUISA DE CLIMA 300 A 500',      'PDA','servico','Pesquisa', 7000.00, NULL, 'treinamento', 'Modelo Grou; relatório final único', 392),
  ('PESQUISA DE CLIMA 500 A 1.000',    'PDA','servico','Pesquisa', 9000.00, NULL, 'treinamento', 'Modelo Grou; relatório final único. Acima de 1.000: consultar', 393),
  ('PESQUISA FEEDBACK 360/90 ATÉ 100',     'PDA','servico','Pesquisa', 5800.00, NULL, 'treinamento', 'Avaliação de liderança/colaboradores; relatório final único', 394),
  ('PESQUISA FEEDBACK 360/90 100 A 300',   'PDA','servico','Pesquisa', 9500.00, NULL, 'treinamento', 'Avaliação de liderança/colaboradores; relatório final único', 395),
  ('PESQUISA FEEDBACK 360/90 300 A 500',   'PDA','servico','Pesquisa', 14600.00, NULL, 'treinamento', 'Avaliação de liderança/colaboradores; relatório final único', 396),
  ('PESQUISA FEEDBACK 360/90 500 A 1.000', 'PDA','servico','Pesquisa', 23500.00, NULL, 'treinamento', 'Acima de 1.000: consultar', 397),
  ('PESQUISA - KICK-OFF COM AVALIADORES',   'PDA','servico','Pesquisa (adicional)', 630.00, NULL, 'treinamento', '1h', 398),
  ('PESQUISA - CURADORIA DAS PERGUNTAS',    'PDA','servico','Pesquisa (adicional)', 1890.00, NULL, 'treinamento', '3h', 399),
  ('PESQUISA - REUNIÃO DE ENTREGA',         'PDA','servico','Pesquisa (adicional)', 1260.00, NULL, 'treinamento', '2h, diretoria e/ou RH', 400),
  ('PESQUISA - PLANO DE AÇÃO',              'PDA','servico','Pesquisa (adicional)', 1890.00, NULL, 'treinamento', '3h', 401),
  ('PESQUISA - DEVOLUTIVA POR LÍDER',       'PDA','servico','Pesquisa (adicional)', 945.00, NULL, 'treinamento', '1h30 por líder avaliado', 402),
  ('PESQUISA - DEVOLUTIVA AOS AVALIADORES', 'PDA','servico','Pesquisa (adicional)', 1260.00, NULL, 'treinamento', '2h', 403),
  ('PESQUISA - HORA EXTRA DE DESENVOLVIMENTO','PDA','servico','Pesquisa (adicional)', 630.00, NULL, 'treinamento', 'Por hora', 404),
  -- Integrações PDA
  ('INTEGRAÇÃO WEB SERVICES COMPLETA', 'PDA','produto','Integração', 72760.00, NULL, 'licenciamento', NULL, 410),
  ('INTEGRAÇÃO WEB SERVICES MODELO SICREDI', 'PDA','produto','Integração', 63130.00, NULL, 'licenciamento', NULL, 411),
  ('INTEGRAÇÃO WEB SERVICES STANDARD', 'PDA','produto','Integração', 43870.00, NULL, 'licenciamento', NULL, 412),
  ('INTEGRAÇÃO DE SOQUETE PDA', 'PDA','produto','Integração', 59000.00, NULL, 'licenciamento', '80 horas', 413),
  ('INTEGRAÇÃO ANALYTICS PDA', 'PDA','produto','Integração', 29500.00, NULL, 'licenciamento', '30 horas', 414),
  ('INTEGRAÇÃO ANALYTICS DE COMPETÊNCIAS', 'PDA','produto','Integração', 24600.00, NULL, 'licenciamento', '25 horas', 415),
  ('INTEGRAÇÃO ANALYTICS DE CARGO', 'PDA','produto','Integração', 24600.00, NULL, 'licenciamento', '25 horas', 416),
  ('GERAÇÃO MASSIVA DE PDF - COMPETÊNCIAS PDA', 'PDA','produto','Integração', 24600.00, NULL, 'licenciamento', '25 horas', 417)
) AS v(nome, marca, tipo, sub, preco, parc, classe, descr, ordem)
WHERE NOT EXISTS (SELECT 1 FROM public.products p WHERE p.nome = v.nome);

-- Talent Compass: colaboradores × módulos
INSERT INTO public.products (nome, marca, tipo, subcategoria, preco_tabela, classificacao_fiscal, ativo, ordem)
SELECT 'TALENT COMPASS ' || f.faixa || ' · ' || m.mod || ' MÓDULOS', 'PDA', 'produto', 'Talent Compass', f.precos[m.mod - 2], 'licenciamento', true, 420 + f.o * 4 + m.mod
FROM (VALUES
  (0, '100 A 500',        ARRAY[30000, 53000, 76000, 100000]::numeric[]),
  (1, '500 A 1.000',      ARRAY[35000, 59000, 82000, 105000]::numeric[]),
  (2, '1.000 A 3.000',    ARRAY[47000, 70000, 94000, 117000]::numeric[]),
  (3, '3.000 A 5.000',    ARRAY[70000, 94000, 117000, 140000]::numeric[]),
  (4, '5.000 A 10.000',   ARRAY[87500, 111000, 135000, 152000]::numeric[]),
  (5, '10.000 A 50.000',  ARRAY[105000, 123000, 146000, 170000]::numeric[]),
  (6, '50.000 A 100.000', ARRAY[117000, 140000, 164000, 187000]::numeric[]),
  (7, 'ACIMA DE 100.000', ARRAY[135000, 152000, 175000, 199000]::numeric[])
) AS f(o, faixa, precos)
CROSS JOIN (VALUES (3), (4), (5), (6)) AS m(mod)
WHERE NOT EXISTS (
  SELECT 1 FROM public.products p WHERE p.nome = 'TALENT COMPASS ' || f.faixa || ' · ' || m.mod || ' MÓDULOS'
);

-- 3) Modelo de proposta dos itens novos
UPDATE public.products p SET proposta_modelo_id = m.id FROM public.proposta_modelos m
WHERE m.nome = 'Licença PDA' AND p.proposta_modelo_id IS NULL AND p.marca = 'PDA'
  AND p.subcategoria IN ('Partner', 'Partner (pacote 10)', 'Crédito');
UPDATE public.products p SET proposta_modelo_id = m.id FROM public.proposta_modelos m
WHERE m.nome = 'Capacitação PDA' AND p.proposta_modelo_id IS NULL AND p.marca = 'PDA'
  AND p.subcategoria IN ('Certificação aberta', 'Certificação in company');

-- 4) Itens antigos do RD, sem marca nem tipo: saem da lista de escolha
UPDATE public.products SET ativo = false, updated_at = now()
WHERE marca IS NULL AND tipo IS NULL AND ativo;
