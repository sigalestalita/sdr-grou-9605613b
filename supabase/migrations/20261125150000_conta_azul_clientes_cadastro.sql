-- Cadastro do cliente na Conta Azul: observações gerais, contatos, e-mails
-- de cobrança e inscrições. Lido de /v1/pessoas (o Compass só lê).
ALTER TABLE public.ca_clientes
  ADD COLUMN IF NOT EXISTS observacoes text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS telefone text,
  ADD COLUMN IF NOT EXISTS outros_contatos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS emails_cobranca text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS inscricao_estadual text,
  ADD COLUMN IF NOT EXISTS inscricao_municipal text,
  ADD COLUMN IF NOT EXISTS endereco jsonb,
  ADD COLUMN IF NOT EXISTS ativo boolean,
  ADD COLUMN IF NOT EXISTS ca_alterado_em timestamptz,
  ADD COLUMN IF NOT EXISTS detalhe_em timestamptz;

CREATE INDEX IF NOT EXISTS ca_clientes_company_idx ON public.ca_clientes (company_id);
CREATE INDEX IF NOT EXISTS ca_clientes_documento_idx ON public.ca_clientes (documento);
