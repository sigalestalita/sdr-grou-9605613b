-- Conexão com a API do RD Marketing (OAuth) para trazer o histórico completo
-- dos leads: todas as conversões e oportunidades, não só a primeira e a
-- última que o export em CSV traz.

-- Uma linha só. Sem política de acesso: só o servidor (chave de serviço) lê
-- e grava, porque guarda o token de acesso à conta do RD.
CREATE TABLE IF NOT EXISTS public.rd_marketing_conexao (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  refresh_token text,
  access_token text,
  expira_em timestamptz,
  state text,
  state_em timestamptz,
  conectado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  conectado_em timestamptz,
  ultimo_erro text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.rd_marketing_conexao ENABLE ROW LEVEL SECURITY;

-- Quando o histórico do lead foi buscado na API (nulo = ainda não).
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS rd_mkt_historico_em timestamptz;
CREATE INDEX IF NOT EXISTS leads_rdm_pendentes
  ON public.leads (id) WHERE rd_marketing_id IS NOT NULL AND rd_mkt_historico_em IS NULL;
CREATE INDEX IF NOT EXISTS leads_email_lower ON public.leads (lower(email));
