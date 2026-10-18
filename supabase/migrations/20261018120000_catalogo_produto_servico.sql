-- Catálogo: produto × serviço, marca e preço de tabela; itens no negócio;
-- meta dividida em produto e serviço.
--
-- Briefing: "o executivo tem meta de produto e meta de serviço. Uma proposta
-- com licença mais certificação precisa entrar dividida nas duas, e hoje não
-- entra — por isso existe uma planilha só para fazer essa divisão à mão."
-- Com o item classificado (produto/serviço) a divisão sai sozinha.
--
-- A lista é a da planilha de comissionamento 2026 (aba Formulas), por marca
-- (PDA, Talogy, Self Guru) e tipo. O preço é o da Tabela de Preço Grou 2026
-- (atualizada em 05/01/2026); onde a tabela não traz um valor único
-- (faixa, "consultar", por pessoa), fica em branco para o ADM preencher.

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS marca text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS tipo text CHECK (tipo IN ('produto', 'servico'));
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS subcategoria text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS descricao text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS preco_tabela numeric(14,2) CHECK (preco_tabela >= 0);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS parcelamento_max smallint CHECK (parcelamento_max BETWEEN 1 AND 24);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS ordem integer NOT NULL DEFAULT 1000;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.products.tipo IS
  'produto (licença, crédito, avaliação) ou servico (certificação, workshop, consultoria). Divide a meta e a comissão.';

-- Quem mantém o catálogo é o Administrativo (e a gestão). A importação do RD
-- usa o service role e não passa por aqui.
DROP POLICY IF EXISTS "products_write" ON public.products;
CREATE POLICY "products_write" ON public.products FOR INSERT TO authenticated
  WITH CHECK (public.pode_faturar(auth.uid()));
DROP POLICY IF EXISTS "products_update" ON public.products;
CREATE POLICY "products_update" ON public.products FOR UPDATE TO authenticated
  USING (public.pode_faturar(auth.uid())) WITH CHECK (public.pode_faturar(auth.uid()));

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

-- ---------------------------------------------------------------------------
-- Proposta: valor total → impostos → valor final
-- ---------------------------------------------------------------------------
-- "O comercial calcula as retenções para pôr na proposta. Tem que haver um
-- campo de impostos entre o valor total e o valor final." O valor final vai em
-- deals.valor_liquido (já existe).
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS valor_impostos numeric(14,2) CHECK (valor_impostos >= 0);

ALTER TABLE public.deal_products ADD COLUMN IF NOT EXISTS ordem smallint NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- Meta dividida
-- ---------------------------------------------------------------------------
ALTER TABLE public.commercial_goals ADD COLUMN IF NOT EXISTS meta_produto numeric(14,2) CHECK (meta_produto >= 0);
ALTER TABLE public.commercial_goals ADD COLUMN IF NOT EXISTS meta_servico numeric(14,2) CHECK (meta_servico >= 0);
COMMENT ON COLUMN public.commercial_goals.meta_produto IS
  'Parte da meta de valor em produto (licenças, créditos). meta_valor = produto + serviço quando as duas existem.';

-- Quem edita os itens do negócio (comercial, CS, gestão) também remove um
-- item da proposta; antes só a gestão apagava.
DROP POLICY IF EXISTS "deal_products_delete" ON public.deal_products;
CREATE POLICY "deal_products_delete" ON public.deal_products FOR DELETE TO authenticated
  USING (
    public.is_manager(auth.uid())
    OR public.has_team(auth.uid(), 'comercial')
    OR public.has_team(auth.uid(), 'cs')
  );
