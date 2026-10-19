-- Módulo Administrativo / Faturamento — o valor do enum vem sozinho.
--
-- ALTER TYPE ... ADD VALUE não pode ser usado na mesma transação em que é
-- criado; por isso fica numa migration própria, antes de quem o usa
-- (mesmo cuidado de 20260908220000_cs_onda1_enums.sql).
ALTER TYPE public.app_team ADD VALUE IF NOT EXISTS 'administrativo';
