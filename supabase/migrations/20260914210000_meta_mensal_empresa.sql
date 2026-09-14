-- Meta mensal da empresa inteira, que é o número da tela inicial da gestão
-- comercial. Não é a soma das metas individuais de commercial_goals: aquelas
-- são por pessoa e por escopo, esta é o alvo do mês da empresa.
--
-- 775 mil é o ponto de partida que a gestão passou; o valor e a base são
-- editáveis em Comercial → Metas.
--
-- A base existe porque as duas leituras não dão o mesmo número no mesmo mês:
--   * 'venda'       -> conta na ordem de compra, que é quando a venda vale;
--   * 'faturamento' -> conta quando o ADM fatura, alguns dias depois.

UPDATE public.app_settings
   SET value = value || jsonb_build_object(
         'meta_faturamento_mensal', 775000,
         'meta_base', 'faturamento'
       ),
       updated_at = now()
 WHERE key = 'comercial'
   AND NOT (value ? 'meta_faturamento_mensal');

INSERT INTO public.app_settings (key, value)
SELECT 'comercial', jsonb_build_object(
  'meta_faturamento_mensal', 775000,
  'meta_base', 'faturamento'
)
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'comercial');
