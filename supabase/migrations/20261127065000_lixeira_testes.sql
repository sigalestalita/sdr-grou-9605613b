-- Cópia (jsonb) dos registros de teste apagados em 27/11/2026, para conferir
-- ou restaurar. Só o service role lê.
CREATE TABLE IF NOT EXISTS public.lixeira_testes (
  id bigserial PRIMARY KEY,
  tabela text NOT NULL,
  dados jsonb NOT NULL,
  apagado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lixeira_testes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lixeira_testes FROM anon, authenticated;
