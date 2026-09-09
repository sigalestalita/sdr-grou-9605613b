-- Health score: a Marcela confirmou que os 10% que faltavam são de "agenda
-- realizada" — o critério passa de 10 para 20 e a soma fecha em 100.
UPDATE public.cs_settings
   SET value = value || '{"agenda": 20}'::jsonb, updated_at = now()
 WHERE key = 'health_weights';
