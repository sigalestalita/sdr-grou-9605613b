-- Talogy: os avulsos DG e QR são os valores Prime de Dilemas e Resiliência.
-- Os itens "CRÉDITO DG/QR PRIME" criados na carga da tabela 2026 duplicavam
-- os avulsos e saem da lista.
UPDATE public.products SET preco_tabela = 159.20, descricao = coalesce(descricao, 'Dilemas, preço Prime (1 a 1.000 créditos)'), updated_at = now()
WHERE nome = 'AVULSO DG' AND marca = 'Talogy';
UPDATE public.products SET preco_tabela = 318.40, descricao = coalesce(descricao, 'Resiliência, preço Prime (1 a 1.000 créditos)'), updated_at = now()
WHERE nome = 'AVULSO QR' AND marca = 'Talogy';
UPDATE public.products SET ativo = false, updated_at = now()
WHERE nome IN ('CRÉDITO DG PRIME', 'CRÉDITO QR PRIME') AND marca = 'Talogy'
  AND NOT EXISTS (SELECT 1 FROM public.deal_products dp WHERE dp.product_id = products.id);
