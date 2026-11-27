-- Reunião analisada como registro próprio (Sales Coach → Compass).
--
-- No RD cada agenda virava um negócio. Aqui não: cada reunião analisada é uma linha desta tabela, sempre ligada à
-- empresa (e ao contato/lead quando há), e ao negócio só quando é reunião de venda do negócio de quem conduziu.
-- Assim a ficha da empresa mostra todas as reuniões de todos os times, e dá para abrir por contato ou por pessoa.
-- Nada sobrescreve nada: os campos da análise ficam em cada reunião.

CREATE TABLE IF NOT EXISTS public.reunioes_analisadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origem text NOT NULL DEFAULT 'sales_coach',
  externo_id text NOT NULL,
  tipo text NOT NULL DEFAULT 'venda' CHECK (tipo IN ('venda', 'atendimento')),
  titulo text CHECK (char_length(titulo) <= 300),
  realizada_em timestamptz,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  conduzida_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  conduzida_por_email text,
  conduzida_por_nome text,
  participante_email text,
  participante_nome text,
  campos jsonb NOT NULL DEFAULT '{}'::jsonb,
  resumo text,
  proximo_passo text,
  proximo_passo_em timestamptz,
  link text,
  linha_do_tempo_em timestamptz,
  tarefa_em timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (origem, externo_id)
);
CREATE INDEX IF NOT EXISTS reunioes_analisadas_empresa ON public.reunioes_analisadas (company_id, realizada_em DESC);
CREATE INDEX IF NOT EXISTS reunioes_analisadas_negocio ON public.reunioes_analisadas (deal_id) WHERE deal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS reunioes_analisadas_contato ON public.reunioes_analisadas (contact_id) WHERE contact_id IS NOT NULL;

ALTER TABLE public.reunioes_analisadas ENABLE ROW LEVEL SECURITY;
-- Leitura igual à das empresas (todos os times); escrita só pelo servidor (service role).
DROP POLICY IF EXISTS reunioes_analisadas_leitura ON public.reunioes_analisadas;
CREATE POLICY reunioes_analisadas_leitura ON public.reunioes_analisadas
  FOR SELECT TO authenticated USING (public.pode_ver_empresas(auth.uid()));

-- O "saco" de campos por negócio/empresa da primeira versão sai: os campos ficam em cada reunião.
ALTER TABLE public.deals DROP COLUMN IF EXISTS sales_coach;
ALTER TABLE public.companies DROP COLUMN IF EXISTS sales_coach;

NOTIFY pgrst, 'reload schema';
