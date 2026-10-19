-- Dados e backfills das migrations de 20261018/20261019.
--
-- Separados dos arquivos de estrutura porque a ferramenta de migration do
-- Lovable Cloud não executa inclusão/alteração de dados: este arquivo roda
-- depois de toda a estrutura (pela ferramenta de dados do Lovable), na ordem
-- abaixo. Tudo é idempotente (ON CONFLICT / WHERE ... IS NULL / unschedule).

-- ===== de 20261018100100_modulo_faturamento.sql =====

INSERT INTO public.teams (slug, nome, descricao, modulo, cor, ordem) VALUES
  ('administrativo', 'Administrativo',
   'Faturamento: política do cliente, conferência do ganho, notas, parcelas e recebimento',
   'administrativo', 'amber', 30)
ON CONFLICT (slug) DO NOTHING;

-- ===== de 20261018110100_acessos_administrativo_trainer.sql =====

INSERT INTO public.teams (slug, nome, descricao, modulo, cor, ordem) VALUES
  ('trainers', 'Trainers',
   'Quem entrega certificações, workshops e mentorias: requerimentos, cronograma, briefing e conclusão',
   'administrativo', 'violet', 40)
ON CONFLICT (slug) DO NOTHING;

-- ===== de 20261018120000_catalogo_produto_servico.sql =====

INSERT INTO public.products (nome, marca, tipo, subcategoria, preco_tabela, parcelamento_max, ordem)
VALUES
  ('LICENÇA 15', 'PDA', 'produto', 'Licença', 3100, 2, 1),
  ('LICENÇA 30', 'PDA', 'produto', 'Licença', 5995, 3, 2),
  ('LICENÇA 50', 'PDA', 'produto', 'Licença', 9702, 3, 3),
  ('LICENÇA 100', 'PDA', 'produto', 'Licença', 17440, 4, 4),
  ('LICENÇA 150', 'PDA', 'produto', 'Licença', 23389, 4, 5),
  ('LICENÇA 200', 'PDA', 'produto', 'Licença', 29453, 4, 6),
  ('LICENÇA 250', 'PDA', 'produto', 'Licença', 34892, 5, 7),
  ('LICENÇA 300', 'PDA', 'produto', 'Licença', NULL, NULL, 8),
  ('LICENÇA 350', 'PDA', 'produto', 'Licença', 38100, 5, 9),
  ('LICENÇA 500', 'PDA', 'produto', 'Licença', 41870, 5, 10),
  ('LICENÇA 750', 'PDA', 'produto', 'Licença', 49299, 5, 11),
  ('LICENÇA 1.000', 'PDA', 'produto', 'Licença', 50566, 6, 12),
  ('LICENÇA 1.500', 'PDA', 'produto', 'Licença', 52148, 6, 13),
  ('LICENÇA 2.000', 'PDA', 'produto', 'Licença', 60302, 6, 14),
  ('LICENÇA 3.000', 'PDA', 'produto', 'Licença', 72349, 6, 15),
  ('LICENÇA 4.000', 'PDA', 'produto', 'Licença', 86810, 6, 16),
  ('LICENÇA 5.000', 'PDA', 'produto', 'Licença', 101567, 6, 17),
  ('LICENÇA 6.000', 'PDA', 'produto', 'Licença', 118833, 6, 18),
  ('LICENÇA 7.000', 'PDA', 'produto', 'Licença', 136658, 6, 19),
  ('LICENÇA 8.000', 'PDA', 'produto', 'Licença', 155788, 6, 20),
  ('LICENÇA 12.000', 'PDA', 'produto', 'Licença', 215927, 6, 21),
  ('LICENÇA 15.000', 'PDA', 'produto', 'Licença', 259083, 6, 22),
  ('LICENÇA 18.000', 'PDA', 'produto', 'Licença', 289800, 6, 23),
  ('LICENÇA 25.000', 'PDA', 'produto', 'Licença', 373008, 6, 24),
  ('LICENÇA 50.000', 'PDA', 'produto', 'Licença', 447655, 6, 25),
  ('LICENÇA 70.000', 'PDA', 'produto', 'Licença', 537190, 6, 26),
  ('LICENÇA 90.000', 'PDA', 'produto', 'Licença', 655490, 6, 27),
  ('LICENÇA ACIMA DE 90.000', 'PDA', 'produto', 'Licença', NULL, 6, 28),
  ('PACOTE 10 - LIC. 15', 'PDA', 'produto', 'Recarga (pacote 10)', 2066.67, NULL, 29),
  ('PACOTE 10 - LIC. 30', 'PDA', 'produto', 'Recarga (pacote 10)', 1998.33, NULL, 30),
  ('PACOTE 10 - LIC. 50', 'PDA', 'produto', 'Recarga (pacote 10)', 1940.4, NULL, 31),
  ('PACOTE 10 - LIC. 100', 'PDA', 'produto', 'Recarga (pacote 10)', 1744.0, NULL, 32),
  ('PACOTE 10 - LIC. 150', 'PDA', 'produto', 'Recarga (pacote 10)', 1559.27, NULL, 33),
  ('PACOTE 10 - LIC. 200', 'PDA', 'produto', 'Recarga (pacote 10)', 1472.65, NULL, 34),
  ('PACOTE 10 - LIC. 250', 'PDA', 'produto', 'Recarga (pacote 10)', 1395.68, NULL, 35),
  ('PACOTE 10 - LIC. 300', 'PDA', 'produto', 'Recarga (pacote 10)', NULL, NULL, 36),
  ('PACOTE 10 - LIC. 350', 'PDA', 'produto', 'Recarga (pacote 10)', 1088.57, NULL, 37),
  ('PACOTE 10 - LIC. 500', 'PDA', 'produto', 'Recarga (pacote 10)', 837.4, NULL, 38),
  ('PACOTE 10 - LIC. 750', 'PDA', 'produto', 'Recarga (pacote 10)', 657.32, NULL, 39),
  ('PACOTE 10 - LIC. 1.000', 'PDA', 'produto', 'Recarga (pacote 10)', 505.66, NULL, 40),
  ('PACOTE 10 - LIC. 1.500', 'PDA', 'produto', 'Recarga (pacote 10)', 347.65, NULL, 41),
  ('PACOTE 10 - LIC. 2.000', 'PDA', 'produto', 'Recarga (pacote 10)', 301.51, NULL, 42),
  ('PACOTE 10 - LIC. 3.000', 'PDA', 'produto', 'Recarga (pacote 10)', 241.16, NULL, 43),
  ('PACOTE 10 - LIC. 4.000', 'PDA', 'produto', 'Recarga (pacote 10)', 217.03, NULL, 44),
  ('PACOTE 10 - LIC. 5.000', 'PDA', 'produto', 'Recarga (pacote 10)', 203.13, NULL, 45),
  ('PACOTE 10 - LIC. 6.000', 'PDA', 'produto', 'Recarga (pacote 10)', 198.06, NULL, 46),
  ('PACOTE 10 - LIC. 7.000', 'PDA', 'produto', 'Recarga (pacote 10)', 195.23, NULL, 47),
  ('PACOTE 10 - LIC. 8.000', 'PDA', 'produto', 'Recarga (pacote 10)', 194.74, NULL, 48),
  ('PACOTE 10 - LIC. 12.000', 'PDA', 'produto', 'Recarga (pacote 10)', 179.94, NULL, 49),
  ('PACOTE 10 - LIC. 15.000', 'PDA', 'produto', 'Recarga (pacote 10)', 172.72, NULL, 50),
  ('PACOTE 10 - LIC. 18.000', 'PDA', 'produto', 'Recarga (pacote 10)', 161.0, NULL, 51),
  ('PACOTE 10 - LIC. 25.000', 'PDA', 'produto', 'Recarga (pacote 10)', 149.2, NULL, 52),
  ('PACOTE 10 - LIC. 50.000', 'PDA', 'produto', 'Recarga (pacote 10)', 89.53, NULL, 53),
  ('PACOTE 10 - LIC. 70.000', 'PDA', 'produto', 'Recarga (pacote 10)', 76.74, NULL, 54),
  ('PACOTE 10 - LIC. 90.000', 'PDA', 'produto', 'Recarga (pacote 10)', 72.83, NULL, 55),
  ('LICENÇA BRONZE', 'PDA', 'produto', 'Partner', 660, NULL, 56),
  ('LICENÇA PRATA', 'PDA', 'produto', 'Partner', 1617, NULL, 57),
  ('LICENÇA OURO', 'PDA', 'produto', 'Partner', 5115, NULL, 58),
  ('LICENÇA ESMERALDA', 'PDA', 'produto', 'Partner', 9570, NULL, 59),
  ('LICENÇA SAFIRA', 'PDA', 'produto', 'Partner', 21725, NULL, 60),
  ('LICENÇA DIAMANTE', 'PDA', 'produto', 'Partner', NULL, NULL, 61),
  ('PACOTE 10 - LIC. BRONZE', 'PDA', 'produto', 'Partner (pacote 10)', NULL, NULL, 62),
  ('PACOTE 10 - LIC. PRATA', 'PDA', 'produto', 'Partner (pacote 10)', 1078, NULL, 63),
  ('PACOTE 10 - LIC. OURO', 'PDA', 'produto', 'Partner (pacote 10)', 1023, NULL, 64),
  ('PACOTE 10 - LIC. ESMERALDA', 'PDA', 'produto', 'Partner (pacote 10)', 957, NULL, 65),
  ('PACOTE 10 - LIC. SAFIRA', 'PDA', 'produto', 'Partner (pacote 10)', 869, NULL, 66),
  ('PACOTE 10 - LIC. DIAMANTE', 'PDA', 'produto', 'Partner (pacote 10)', NULL, NULL, 67),
  ('PDA AVULSO', 'PDA', 'produto', 'Avulso', 294, NULL, 68),
  ('CRÉDITO PDA', 'PDA', 'produto', 'Crédito', NULL, NULL, 69),
  ('COMPETÊNCIAS PDA', 'PDA', 'produto', 'Competências', NULL, NULL, 70),
  ('INTEGRAÇÃO PDA', 'PDA', 'produto', 'Integração', NULL, NULL, 71),
  ('CERTIFICAÇÃO PDA', 'PDA', 'servico', 'Certificação aberta', 1758, NULL, 72),
  ('CERTI PDA IN COMPANY ATÉ 10P', 'PDA', 'servico', 'Certificação in company', 13558, NULL, 73),
  ('CERTI PDA IN COMPANY 11 A 15P', 'PDA', 'servico', 'Certificação in company', 13558, NULL, 74),
  ('CERTI PDA IN COMPANY 15 A 20P', 'PDA', 'servico', 'Certificação in company', NULL, NULL, 75),
  ('CERTIFICAÇÃO GROU ACADEMY PDA', 'PDA', 'servico', 'Certificação Grou Academy', NULL, NULL, 76),
  ('CAPACITAÇÃO FB 360 PDA', 'PDA', 'servico', 'Capacitação', 4943, NULL, 77),
  ('DEVOLUTIVA INDIVIDUAL - 1H', 'PDA', 'servico', 'Devolutiva', 654, NULL, 78),
  ('DEVOLUTIVA GRUPO 2H', 'PDA', 'servico', 'Devolutiva', 2673, NULL, 79),
  ('RELATÓRIO DE TENDÊNCIAS', 'PDA', 'servico', 'Consultoria', NULL, NULL, 80),
  ('ENTREGA DE PROJETO', 'PDA', 'servico', 'Consultoria', NULL, NULL, 81),
  ('HORA CONSULTORIA', 'PDA', 'servico', 'Consultoria', NULL, NULL, 82),
  ('MENTORIA COMPORTAMENTAL', 'PDA', 'servico', 'Mentoria', NULL, NULL, 83),
  ('GA - ESTRUTURAR PDI', 'PDA', 'servico', 'Grou Academy', NULL, NULL, 84),
  ('GA - DEVOLUTIVA ALTO IMPACTO', 'PDA', 'servico', 'Grou Academy', NULL, NULL, 85),
  ('GA - RECRUTAMENTO E SELEÇÃO', 'PDA', 'servico', 'Grou Academy', NULL, NULL, 86),
  ('GA - FORMAÇÃO PDA LÍDERES', 'PDA', 'servico', 'Grou Academy', NULL, NULL, 87),
  ('WS PDA LÍDERES', 'PDA', 'servico', 'Workshop', 13953, NULL, 88),
  ('WS AUTOGESTÃO P/ LIDERANÇAS', 'PDA', 'servico', 'Workshop', 10692, NULL, 89),
  ('WS TEAM BUINDING', 'PDA', 'servico', 'Workshop', 7277, NULL, 90),
  ('WS LÍDER 360', 'PDA', 'servico', 'Workshop', NULL, NULL, 91),
  ('WS NR1', 'PDA', 'servico', 'Workshop', NULL, NULL, 92),
  ('PROGRAMA MASTER LÍDER', 'PDA', 'servico', 'Programa', 93445, NULL, 93),
  ('PROGRAMA PME', 'PDA', 'servico', 'Programa', 3270, NULL, 94),
  ('PROGRAMA PDI', 'PDA', 'servico', 'Programa', 3267, NULL, 95),
  ('PARTICIPANTE EXTRA', 'PDA', 'servico', 'Adicional', 134, NULL, 96),
  ('WS PDA 2H', 'PDA', 'servico', 'Workshop', 5105, NULL, 97),
  ('WS PDA 3H', 'PDA', 'servico', 'Workshop', 6545, NULL, 98),
  ('WS PDA 4H', 'PDA', 'servico', 'Workshop', 7277, NULL, 99),
  ('WS PDA 5H', 'PDA', 'servico', 'Workshop', 7924, NULL, 100),
  ('WS PDA 6H', 'PDA', 'servico', 'Workshop', 10692, NULL, 101),
  ('WS PDA 8H', 'PDA', 'servico', 'Workshop', 13953, NULL, 102),
  ('WS PDA 9H', 'PDA', 'servico', 'Workshop', 14751, NULL, 103),
  ('WS PDA 12H', 'PDA', 'servico', 'Workshop', 18216, NULL, 104),
  ('ASSESSMENT 1P', 'PDA', 'servico', 'Assessment', 2910, NULL, 105),
  ('ASSESSMENT 2P', 'PDA', 'servico', 'Assessment', 4031, NULL, 106),
  ('ASSESSMENT 3P', 'PDA', 'servico', 'Assessment', 5093, NULL, 107),
  ('DASHBOARD', 'PDA', 'servico', 'Assessment', NULL, NULL, 108),
  ('BÚSULA (TOV)', 'PDA', 'servico', 'Programa', 2490, NULL, 109),
  ('PALESTRA', 'PDA', 'servico', 'Palestra', 7480, NULL, 110),
  ('SENSIBILIZAÇÃO', 'PDA', 'servico', 'Workshop', 1335, NULL, 111),
  ('CRÉDITO DG', 'Talogy', 'produto', 'Crédito', 199, NULL, 112),
  ('CRÉDITO QR', 'Talogy', 'produto', 'Crédito', 398, NULL, 113),
  ('AVULSO DG', 'Talogy', 'produto', 'Avulso', NULL, NULL, 114),
  ('AVULSO QR', 'Talogy', 'produto', 'Avulso', NULL, NULL, 115),
  ('CAPACITAÇÃO QR', 'Talogy', 'servico', 'Capacitação', 3080, NULL, 116),
  ('CAPACITAÇÃO DG', 'Talogy', 'servico', 'Capacitação', 3080, NULL, 117),
  ('CAPACITAÇÃO GROU ACADEMY QR', 'Talogy', 'servico', 'Capacitação Grou Academy', NULL, NULL, 118),
  ('CAPACITAÇÃO GROU ACADEMY DG', 'Talogy', 'servico', 'Capacitação Grou Academy', NULL, NULL, 119),
  ('WS LIDERANÇA ASSERTIVA DILEMAS E DECISÕES', 'Talogy', 'servico', 'Workshop', 13953, NULL, 120),
  ('AVALIAÇÃO PDA', 'Self Guru', 'produto', 'Avaliação', NULL, NULL, 121),
  ('AVALIAÇÃO DG', 'Self Guru', 'produto', 'Avaliação', NULL, NULL, 122),
  ('AVALIAÇÃO QR', 'Self Guru', 'produto', 'Avaliação', NULL, NULL, 123),
  ('FF LEADER', 'Self Guru', 'servico', 'Coaching', 5688, NULL, 124),
  ('FF PREMIUM', 'Self Guru', 'servico', 'Coaching', 9480, NULL, 125),
  ('COACHING PJ', 'Self Guru', 'servico', 'Coaching', NULL, NULL, 126),
  ('COACHING PF', 'Self Guru', 'servico', 'Coaching', NULL, NULL, 127),
  ('MENTORIA', 'Self Guru', 'servico', 'Mentoria', 980, NULL, 128),
  ('TRANSITION PREMIUM', 'Self Guru', 'servico', 'Coaching', 11376, NULL, 129),
  ('TRANSITION', 'Self Guru', 'servico', 'Coaching', 7840, NULL, 130),
  ('PLANEJ. PREMIUM', 'Self Guru', 'servico', 'Carreira', NULL, NULL, 131),
  ('PLANEJ. DE CARREIRA', 'Self Guru', 'servico', 'Carreira', NULL, NULL, 132)
ON CONFLICT (nome) DO UPDATE SET
  marca = COALESCE(public.products.marca, EXCLUDED.marca),
  tipo = COALESCE(public.products.tipo, EXCLUDED.tipo),
  subcategoria = COALESCE(public.products.subcategoria, EXCLUDED.subcategoria),
  preco_tabela = COALESCE(public.products.preco_tabela, EXCLUDED.preco_tabela),
  parcelamento_max = COALESCE(public.products.parcelamento_max, EXCLUDED.parcelamento_max),
  ordem = EXCLUDED.ordem;

-- ===== de 20261018150000_comissionamento.sql =====
INSERT INTO public.comissao_regras (ano) VALUES (2026) ON CONFLICT (ano) DO NOTHING;

-- ===== de 20261019100000_espinha_empresa_contato_negocio.sql =====

-- Negócios antigos sem empresa (do RD e dos exemplos) ganham uma agora.
UPDATE public.deals SET company_id = NULL WHERE company_id IS NULL;

DO $$
BEGIN
  PERFORM cron.unschedule('vincular-leads') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'vincular-leads');
  -- De hora em hora (24 execuções/dia), até 5.000 leads por vez; a função se
  -- desagenda quando não há mais pendentes (20261019145000).
  PERFORM cron.schedule('vincular-leads', '17 * * * *', 'SELECT public.vincular_leads_pendentes(5000)');
EXCEPTION WHEN undefined_function OR invalid_schema_name OR undefined_table THEN
  RAISE NOTICE 'pg_cron indisponível: rode SELECT public.vincular_leads_pendentes(5000) até voltar 0';
END $$;

-- ===== de 20261019110000_funis_de_conta_carteira.sql =====

INSERT INTO public.pipelines (nome, slug, tipo, ordem)
VALUES ('Gestão da Carteira Comercial', 'gestao-carteira-comercial', 'conta', 100)
ON CONFLICT (slug) DO NOTHING;

-- Etapas iniciais; a importação do RD acrescenta as que existirem lá.
INSERT INTO public.pipeline_stages (pipeline_id, nome, slug, ordem, kind)
SELECT p.id, s.nome, s.slug, s.ordem, 'open'
  FROM public.pipelines p
  CROSS JOIN (VALUES
    ('Novo na carteira', 'novo-na-carteira', 10),
    ('Em acompanhamento', 'em-acompanhamento', 20)
  ) AS s(nome, slug, ordem)
 WHERE p.slug = 'gestao-carteira-comercial'
ON CONFLICT (pipeline_id, slug) DO NOTHING;

-- Quem já comprou entra na carteira agora, sem aviso (a gestão distribui pelo
-- quadro). O dono herda o da empresa, quando houver.
INSERT INTO public.company_funis (company_id, pipeline_id, stage_id, owner_user_id)
SELECT DISTINCT ON (d.company_id) d.company_id, p.id, st.id, c.owner_user_id
  FROM public.deals d
  JOIN public.pipelines dp ON dp.id = d.pipeline_id AND dp.tipo = 'comercial'
  JOIN public.companies c ON c.id = d.company_id
  CROSS JOIN public.pipelines p
  LEFT JOIN LATERAL (
    SELECT id FROM public.pipeline_stages
     WHERE pipeline_id = p.id AND kind = 'open' ORDER BY ordem OFFSET 1 LIMIT 1
  ) st ON true
 WHERE d.status = 'won' AND p.slug = 'gestao-carteira-comercial'
ON CONFLICT (company_id, pipeline_id) DO NOTHING;

-- ===== de 20261019120000_ciclo_de_vida_da_empresa.sql =====

-- Valores antigos (vindos do RD/CS) dão lugar ao calculado.
SELECT public.recalcular_ciclo_de_vida(NULL);

DO $$
BEGIN
  PERFORM cron.unschedule('ciclo-de-vida') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ciclo-de-vida');
  -- 03:10 em Brasília: depois da virada do dia em que a licença vence.
  PERFORM cron.schedule('ciclo-de-vida', '10 6 * * *', 'SELECT public.recalcular_ciclo_de_vida(NULL)');
EXCEPTION WHEN undefined_function OR invalid_schema_name OR undefined_table THEN
  RAISE NOTICE 'pg_cron indisponível: rode SELECT public.recalcular_ciclo_de_vida(NULL) diariamente';
END $$;
