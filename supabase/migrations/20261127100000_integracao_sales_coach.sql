-- Integração com o Sales Coach (repositório salescoach-grou, conector "compass").
--
-- O Sales Coach chama POST /api/public/integracao com um token "compass_…" e grava o resultado de cada
-- reunião analisada: campos no negócio (ou na empresa), a nota na linha do tempo e o próximo passo.
-- Só o servidor (service role) lê estas tabelas; a gestão gera e revoga tokens pelas funções do app.

CREATE TABLE IF NOT EXISTS public.integracao_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL DEFAULT 'Sales Coach' CHECK (char_length(nome) <= 80),
  prefixo text NOT NULL,
  hash text NOT NULL UNIQUE,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  usado_em timestamptz,
  revogado_em timestamptz
);
ALTER TABLE public.integracao_tokens ENABLE ROW LEVEL SECURITY;

-- Campos que o Sales Coach cria ("Criar campos do Sales Coach"): nota, temperatura, critérios…
CREATE TABLE IF NOT EXISTS public.salescoach_campos (
  key text PRIMARY KEY CHECK (key ~ '^[a-z0-9_]{1,48}$'),
  label text NOT NULL CHECK (char_length(label) <= 80),
  type text NOT NULL DEFAULT 'text' CHECK (char_length(type) <= 20),
  options jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.salescoach_campos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS salescoach_campos_leitura ON public.salescoach_campos;
CREATE POLICY salescoach_campos_leitura ON public.salescoach_campos
  FOR SELECT TO authenticated USING (true);

-- Valores da última análise, por chave de campo (o negócio; sem negócio, a empresa).
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS sales_coach jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS sales_coach jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Aviso ao dono quando a análise define o próximo passo.
ALTER TABLE public.notificacoes DROP CONSTRAINT IF EXISTS notificacoes_tipo_check;
ALTER TABLE public.notificacoes ADD CONSTRAINT notificacoes_tipo_check CHECK (tipo = ANY (ARRAY[
  'mencao', 'ganho_para_faturar', 'pendencia_adm', 'pendencia_respondida', 'requerimento', 'trainer',
  'licenca', 'comissao', 'contrato', 'turma', 'carteira', 'proposta', 'ficha', 'conta_azul',
  'negocio_retomado', 'ticket', 'sales_coach'
]::text[]));

NOTIFY pgrst, 'reload schema';
