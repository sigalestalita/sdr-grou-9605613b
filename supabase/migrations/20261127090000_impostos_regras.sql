-- Calculadora de impostos: regras editáveis (como /admin/regras da calculadora
-- original) e histórico das simulações. O motor é src/lib/impostos/calculo.ts.
CREATE TABLE IF NOT EXISTS public.impostos_regras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave text UNIQUE,
  nome text NOT NULL CHECK (length(trim(nome)) BETWEEN 1 AND 160),
  classificacao text CHECK (classificacao IN ('licenciamento','suporte','treinamento')),
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  tipo_pessoa text CHECK (tipo_pessoa IN ('CPF','CNPJ')),
  regime text,
  exceto_regimes text[] NOT NULL DEFAULT '{}',
  municipio text,
  categoria_especial_iss boolean NOT NULL DEFAULT false,
  valor_min numeric,
  valor_max numeric,
  prioridade integer NOT NULL DEFAULT 10,
  itens jsonb NOT NULL DEFAULT '[]'::jsonb,
  observacoes text,
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  atualizado_por uuid,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.impostos_regras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS impostos_regras_ler ON public.impostos_regras;
CREATE POLICY impostos_regras_ler ON public.impostos_regras FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS impostos_regras_editar ON public.impostos_regras;
CREATE POLICY impostos_regras_editar ON public.impostos_regras FOR ALL TO authenticated
  USING (public.is_manager(auth.uid()) OR public.has_team(auth.uid(), 'administrativo'))
  WITH CHECK (public.is_manager(auth.uid()) OR public.has_team(auth.uid(), 'administrativo'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.impostos_regras TO authenticated;

INSERT INTO public.impostos_regras (chave, nome, classificacao, tipo_pessoa, regime, exceto_regimes, municipio,
  categoria_especial_iss, valor_min, valor_max, prioridade, itens, observacoes, ordem) VALUES
('trein-cpf', 'Treinamento — CPF (sem retenção)', 'treinamento', 'CPF', null, array[]::text[], null, false, null, null, 10, '[]'::jsonb, 'Pessoa física: nenhuma retenção.', 10),
('trein-simples', 'Treinamento — CNPJ Simples Nacional', 'treinamento', 'CNPJ', 'Simples Nacional', array[]::text[], null, false, null, null, 20, '[{"imposto": "IRRF", "aliquota": 1.5}]'::jsonb, 'Simples Nacional: dispensada retenção de PIS/COFINS/CSLL. Reter apenas IRRF 1,5%.', 20),
('trein-mei', 'Treinamento — CNPJ MEI', 'treinamento', 'CNPJ', 'MEI', array[]::text[], null, false, null, null, 20, '[{"imposto": "IRRF", "aliquota": 1.5}]'::jsonb, 'MEI dispensado de PIS, COFINS e CSLL. Retém apenas IRRF 1,5%.', 30),
('trein-isento', 'Treinamento — CNPJ Isento', 'treinamento', 'CNPJ', 'Isento', array[]::text[], null, false, null, null, 20, '[{"imposto": "PIS", "aliquota": 0.65}, {"imposto": "COFINS", "aliquota": 3}, {"imposto": "CSLL", "aliquota": 1}, {"imposto": "IRRF", "aliquota": 1.5}]'::jsonb, 'Cliente isento: deixa de reter ISS, mas federais (1,5% IRRF + 4,65%) continuam.', 40),
('trein-ate-215', 'Treinamento — CNPJ até R$ 215,05', 'treinamento', 'CNPJ', null, array[]::text[], null, false, null, 215.05, 10, '[]'::jsonb, 'Até R$ 215,05: sem retenção federal.', 50),
('trein-215-666', 'Treinamento — CNPJ R$ 215,06 a R$ 666,66', 'treinamento', 'CNPJ', null, array[]::text[], null, false, 215.06, 666.66, 10, '[{"imposto": "PIS", "aliquota": 0.65}, {"imposto": "COFINS", "aliquota": 3}, {"imposto": "CSLL", "aliquota": 1}]'::jsonb, 'Reter PIS 0,65% + COFINS 3% + CSLL 1%. IRRF dispensado nesta faixa.', 60),
('trein-acima-666', 'Treinamento — CNPJ acima de R$ 666,66', 'treinamento', 'CNPJ', null, array[]::text[], null, false, 666.67, null, 10, '[{"imposto": "PIS", "aliquota": 0.65}, {"imposto": "COFINS", "aliquota": 3}, {"imposto": "CSLL", "aliquota": 1}, {"imposto": "IRRF", "aliquota": 1.5}]'::jsonb, 'Reter PIS 0,65% + COFINS 3% + CSLL 1% + IRRF 1,5%.', 70),
('trein-iss-poa', 'Treinamento — ISS Porto Alegre categoria especial', 'treinamento', 'CNPJ', null, array['Isento']::text[], 'Porto Alegre', true, null, null, 5, '[{"imposto": "ISS", "aliquota": 5}]'::jsonb, 'ISS retido na fonte (5%) quando o tomador é de Porto Alegre e de categoria especial (bancos, seguradoras, órgãos públicos, concessionárias, hospitais, condomínios, escolas privadas etc.).', 80),
('licenciamento-sem-retencao', 'Licenciamento — sem retenção', 'licenciamento', null, null, array[]::text[], null, false, null, null, 1, '[]'::jsonb, 'Licenciamento/Suporte: nenhuma retenção federal nem ISS por padrão.', 90),
('licenciamento-iss-poa', 'Licenciamento — ISS Porto Alegre categoria especial', 'licenciamento', 'CNPJ', null, array['Isento']::text[], 'Porto Alegre', true, null, null, 5, '[{"imposto": "ISS", "aliquota": 2}]'::jsonb, 'ISS retido na fonte (2%) quando o tomador é de Porto Alegre e de categoria especial.', 100),
('suporte-sem-retencao', 'Suporte — sem retenção', 'suporte', null, null, array[]::text[], null, false, null, null, 1, '[]'::jsonb, 'Licenciamento/Suporte: nenhuma retenção federal nem ISS por padrão.', 110),
('suporte-iss-poa', 'Suporte — ISS Porto Alegre categoria especial', 'suporte', 'CNPJ', null, array['Isento']::text[], 'Porto Alegre', true, null, null, 5, '[{"imposto": "ISS", "aliquota": 2}]'::jsonb, 'ISS retido na fonte (2%) quando o tomador é de Porto Alegre e de categoria especial.', 120)
ON CONFLICT (chave) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.impostos_simulacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  titulo text,
  entrada jsonb NOT NULL,
  resultado jsonb NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS impostos_simulacoes_user ON public.impostos_simulacoes (user_id, criado_em DESC);
ALTER TABLE public.impostos_simulacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS impostos_simulacoes_ler ON public.impostos_simulacoes;
CREATE POLICY impostos_simulacoes_ler ON public.impostos_simulacoes FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_manager(auth.uid()) OR public.has_team(auth.uid(), 'administrativo'));
DROP POLICY IF EXISTS impostos_simulacoes_criar ON public.impostos_simulacoes;
CREATE POLICY impostos_simulacoes_criar ON public.impostos_simulacoes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS impostos_simulacoes_apagar ON public.impostos_simulacoes;
CREATE POLICY impostos_simulacoes_apagar ON public.impostos_simulacoes FOR DELETE TO authenticated
  USING (user_id = auth.uid());
GRANT SELECT, INSERT, DELETE ON public.impostos_simulacoes TO authenticated;
NOTIFY pgrst, 'reload schema';
