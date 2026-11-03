-- Calculadora de impostos retidos dentro do Compass (era um app à parte no
-- Lovable). As regras ficam no código (src/lib/impostos/calculo.ts); aqui só
-- o que cada uma precisa saber:
--   - o item do catálogo diz a classificação fiscal (licenciamento, suporte ou
--     treinamento — o CNAE da nota);
--   - a empresa guarda o regime tributário e se é "categoria especial" do ISS
--     em Porto Alegre (respondido uma vez, vale para as próximas propostas);
--   - o negócio guarda o detalhamento do último cálculo.

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS classificacao_fiscal text
  CHECK (classificacao_fiscal IN ('licenciamento', 'suporte', 'treinamento'));
COMMENT ON COLUMN public.products.classificacao_fiscal IS
  'licenciamento (CNAE 62.03-1-00), suporte (62.09-1-00) ou treinamento (85.99-6-04). Decide as retenções.';

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS regime_tributario text
  CHECK (regime_tributario IN ('Simples Nacional', 'MEI', 'Lucro Presumido', 'Lucro Real', 'Isento'));
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS iss_categoria_especial boolean;
COMMENT ON COLUMN public.companies.iss_categoria_especial IS
  'Tomador de Porto Alegre enquadrado como categoria especial de ISS (bancos, seguradoras, órgãos públicos, concessionárias, hospitais, condomínios, escolas privadas…). null = não respondido.';

ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS impostos_calculo jsonb;
COMMENT ON COLUMN public.deals.impostos_calculo IS
  'Último cálculo de retenções (cliente, regras e linha por imposto), gravado junto com valor_impostos.';

-- Classificação inicial, pela lista da calculadora: licenças, créditos,
-- avulsos, integração e competências = licenciamento; certificação PDA aberta
-- e consultoria técnica = suporte; o resto dos serviços = treinamento.
UPDATE public.products SET classificacao_fiscal = 'licenciamento'
WHERE classificacao_fiscal IS NULL AND tipo = 'produto';
UPDATE public.products SET classificacao_fiscal = 'suporte'
WHERE classificacao_fiscal IS NULL AND tipo = 'servico'
  AND (subcategoria = 'Certificação aberta' OR nome = 'HORA CONSULTORIA');
UPDATE public.products SET classificacao_fiscal = 'treinamento'
WHERE classificacao_fiscal IS NULL AND tipo = 'servico';
