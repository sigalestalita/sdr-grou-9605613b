-- Revisão de valores de negócios antigos (campo "[backup] Valor" do RD, que perdeu a vírgula dos centavos:
-- R$ 2.456,10 virou 24561). A lista é montada por SQL (negócio ganho, valor só do backup, muito acima do preço
-- típico do produto no mesmo ano e terminando em dígito ≠ 0) e o time decide em /revisao-valores:
-- ÷10, ÷100, manter ou outro valor. Cada decisão já corrige deals.amount (provenance amount = manual) e guarda
-- o valor de antes aqui.
CREATE TABLE IF NOT EXISTS public.revisao_valores (
  deal_id uuid PRIMARY KEY REFERENCES public.deals(id) ON DELETE CASCADE,
  rd_deal_id text,
  company_id uuid,
  empresa text,
  negocio text,
  produto text,
  fechado_em date,
  valor_original numeric NOT NULL,
  preco_tipico numeric,
  sugestao numeric,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'corrigido', 'mantido')),
  valor_final numeric,
  revisado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revisado_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS revisao_valores_status ON public.revisao_valores (status, valor_original DESC);
ALTER TABLE public.revisao_valores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS revisao_valores_leitura ON public.revisao_valores;
CREATE POLICY revisao_valores_leitura ON public.revisao_valores FOR SELECT TO authenticated
  USING (public.is_manager(auth.uid()) OR public.has_team(auth.uid(), 'administrativo'));

-- Candidatos (idempotente: não reabre o que já foi revisado).
WITH b AS (
  SELECT d.id, d.amount, d.rd_deal_id, d.nome, d.company_id, coalesce(d.closed_at_original, d.closed_at::date) AS fechado,
    coalesce(upper(trim((SELECT x->>'value' FROM jsonb_array_elements(r.raw->'deal_custom_fields') x
                         WHERE x->'custom_field'->>'label' = '[backup] Produtos' LIMIT 1))), '(SEM PRODUTO)') AS produto
  FROM public.deals d JOIN public.rd_deals r ON r.rd_id = d.rd_deal_id
  WHERE d.status = 'won' AND coalesce((r.raw->>'amount_total')::numeric, 0) = 0
    AND coalesce(d.provenance->>'amount', '') <> 'manual'
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(r.raw->'deal_custom_fields') x WHERE x->'custom_field'->>'label' = '[backup] Valor')
), por_ano AS (
  SELECT produto, extract(year FROM fechado)::int AS ano, count(*) n, percentile_cont(0.5) WITHIN GROUP (ORDER BY amount) AS med
  FROM b WHERE amount > 0 GROUP BY 1, 2
), geral AS (
  SELECT produto, percentile_cont(0.5) WITHIN GROUP (ORDER BY amount) AS med FROM b WHERE amount > 0 GROUP BY 1
), cand AS (
  SELECT b.*, CASE WHEN pa.n >= 5 THEN pa.med ELSE g.med END AS med
  FROM b LEFT JOIN por_ano pa ON pa.produto = b.produto AND pa.ano = extract(year FROM b.fechado)::int
  JOIN geral g ON g.produto = b.produto
)
INSERT INTO public.revisao_valores (deal_id, rd_deal_id, company_id, empresa, negocio, produto, fechado_em, valor_original, preco_tipico, sugestao)
SELECT c.id, c.rd_deal_id, c.company_id, co.nome, c.nome, c.produto, c.fechado, c.amount, round(c.med::numeric, 2),
  CASE WHEN c.amount / 10.0 BETWEEN 0.2 * c.med AND 5 * c.med THEN round(c.amount / 10.0, 2)
       WHEN c.amount / 100.0 BETWEEN 0.2 * c.med AND 5 * c.med THEN round(c.amount / 100.0, 2) END
FROM cand c LEFT JOIN public.companies co ON co.id = c.company_id
WHERE c.amount::bigint % 10 <> 0 AND c.amount > 3 * c.med AND c.amount >= 1000
ON CONFLICT (deal_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
