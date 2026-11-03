-- Ficha cadastral do cliente no Compass.
--
-- A ficha continua sendo o app "cadastro-grou" (fichacadastral.grougp.com.br):
-- a cada envio ele manda a ficha inteira para /api/public/fichas/webhook
-- (com o segredo de app_settings.ficha_cadastral_webhook). Aqui ela é ligada
-- à empresa pelo CNPJ (ou ao contato pelo e-mail) e aparece no negócio para o
-- comercial e o financeiro. O histórico veio do CSV exportado do painel.

CREATE TABLE IF NOT EXISTS public.fichas_cadastrais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  externo_id text UNIQUE,            -- id da ficha no app de cadastro (null no histórico do CSV)
  origem text NOT NULL CHECK (origem IN ('webhook', 'csv')),
  tipo text NOT NULL CHECK (tipo IN ('CNPJ', 'CPF')),
  documento text,                    -- só dígitos
  nome text NOT NULL,                -- razão social (PJ) ou nome completo (PF)
  nome_fantasia text,
  email text,
  vendedor_nome text,
  vendedor_user_id uuid,
  cidade text,
  estado text,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,  -- a ficha inteira, como veio
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  enviada_em timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fichas_cadastrais_doc_idx ON public.fichas_cadastrais (documento);
CREATE INDEX IF NOT EXISTS fichas_cadastrais_company_idx ON public.fichas_cadastrais (company_id);
-- Histórico do CSV: uma linha por documento + data (reimportar não duplica).
CREATE UNIQUE INDEX IF NOT EXISTS fichas_cadastrais_csv_uniq
  ON public.fichas_cadastrais (documento, enviada_em) WHERE origem = 'csv';

ALTER TABLE public.fichas_cadastrais ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fichas_cadastrais_read ON public.fichas_cadastrais;
CREATE POLICY fichas_cadastrais_read ON public.fichas_cadastrais FOR SELECT TO authenticated
  USING (public.pode_propor(auth.uid()));
DROP POLICY IF EXISTS fichas_cadastrais_update ON public.fichas_cadastrais;
CREATE POLICY fichas_cadastrais_update ON public.fichas_cadastrais FOR UPDATE TO authenticated
  USING (public.pode_propor(auth.uid())) WITH CHECK (public.pode_propor(auth.uid()));

-- Segredo do webhook (o app de cadastro manda no header x-compass-secret).
INSERT INTO public.app_settings (key, value)
VALUES ('ficha_cadastral_webhook', jsonb_build_object('secret', replace(gen_random_uuid()::text, '-', '')))
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.notificacoes DROP CONSTRAINT IF EXISTS notificacoes_tipo_check;
ALTER TABLE public.notificacoes ADD CONSTRAINT notificacoes_tipo_check CHECK (tipo IN (
  'mencao', 'ganho_para_faturar', 'pendencia_adm', 'pendencia_respondida',
  'requerimento', 'trainer', 'licenca', 'comissao', 'contrato', 'turma', 'carteira', 'proposta', 'ficha'
));
