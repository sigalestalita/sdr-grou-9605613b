-- Itens que não estão na Tabela de Preço Grou 2026: saem da lista de escolha
-- (continuam nos negócios antigos).
UPDATE public.products SET ativo = false, updated_at = now()
WHERE ativo AND (
  (marca = 'Self Guru' AND nome IN ('AVALIAÇÃO PDA', 'AVALIAÇÃO DG', 'AVALIAÇÃO QR', 'COACHING PF', 'COACHING PJ', 'PLANEJ. DE CARREIRA', 'PLANEJ. PREMIUM'))
  OR (marca = 'PDA' AND nome IN ('LICENÇA 300', 'PACOTE 10 - LIC. 300'))
);
