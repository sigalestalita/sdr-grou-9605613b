-- Papel "trainer": quem entrega o serviço (certificação, workshop, mentoria).
-- Em migration própria porque ADD VALUE não pode ser usado na mesma transação.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'trainer';
