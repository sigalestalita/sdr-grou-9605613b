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
-- (dado/backfill movido para 20261019150000_dados_e_backfills.sql)

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
