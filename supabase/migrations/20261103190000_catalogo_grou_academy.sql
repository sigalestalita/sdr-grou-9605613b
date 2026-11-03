-- Preços da Grou Academy (Tabela de Preço Grou 2026, slide 18).
UPDATE public.products SET preco_tabela = v.preco, descricao = coalesce(descricao, v.descr), updated_at = now()
FROM (VALUES
  ('CERTIFICAÇÃO GROU ACADEMY PDA', 658.00, 'Certificação Analista Comportamental PDA (Grou Academy, 4 horas)'),
  ('GA - ESTRUTURAR PDI', 163.00, 'Como estruturar PDI focado nos eixos comportamentais do PDA (masterclass)'),
  ('GA - DEVOLUTIVA ALTO IMPACTO', 163.00, 'Devolutiva PDA de alto impacto (masterclass)'),
  ('GA - RECRUTAMENTO E SELEÇÃO', 163.00, 'Recrutamento e seleção com análise comportamental PDA (masterclass)'),
  ('GA - FORMAÇÃO PDA LÍDERES', 368.00, 'Formação PDA para líderes'),
  ('CAPACITAÇÃO GROU ACADEMY DG', 368.00, 'Formação Dilemas de Gestão'),
  ('CAPACITAÇÃO GROU ACADEMY QR', 368.00, 'Formação Questionário de Resiliência')
) AS v(nome, preco, descr)
WHERE products.nome = v.nome;
