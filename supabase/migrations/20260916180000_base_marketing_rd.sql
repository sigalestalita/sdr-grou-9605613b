-- Base de marketing do RD dentro do Compass.
--
-- São ~70 mil leads que converteram em conteúdo (ebook, webinar, newsletter,
-- formulário) e nunca viraram negociação. O que já foi migrado até aqui veio do
-- RD CRM: contatos e negócios. Esta é a outra metade.
--
-- Eles entram OCULTOS do kanban. A política de RLS leads_auth_visiveis já
-- esconde quem tem oculto_sdr, e é isso que evita o travamento de
-- carregamento: o kanban lê a tabela inteira paginando, então 70 mil linhas
-- visíveis parariam a tela de pé.
--
-- A regra automática de ocultar (leads_hide_rd_import) não pega estes: ela
-- exige rd_deal_id, e lead de marketing não tem negócio nenhum. Por isso a
-- importação grava oculto_sdr direto, e a coluna nova identifica a origem.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS rd_marketing_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_rd_marketing_id
  ON public.leads (rd_marketing_id)
  WHERE rd_marketing_id IS NOT NULL;

COMMENT ON COLUMN public.leads.rd_marketing_id IS
  'Identificador do lead na base de marketing do RD. Chave da importação, para reimportar sem duplicar.';

/*
 * O histórico de conversões.
 *
 * É o que dá sentido ao lead de marketing: sozinho ele é um e-mail, com o
 * histórico ele é "baixou três materiais de gestão de pessoas no último ano".
 * Fica em tabela própria porque são muitas linhas por lead e porque a maioria
 * nunca vai ser consultada — não faz sentido inchar a tabela de leads.
 */
CREATE TABLE IF NOT EXISTS public.lead_conversoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  -- nome da conversão no RD: "ebook-gestao-comportamental", "newsletter"…
  nome text NOT NULL,
  origem text,
  canal text,
  ocorrida_em timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Reimportar não duplica: a mesma conversão do mesmo lead entra uma vez só.
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_conversoes_unica
  ON public.lead_conversoes (lead_id, nome, ocorrida_em);
CREATE INDEX IF NOT EXISTS idx_lead_conversoes_lead
  ON public.lead_conversoes (lead_id, ocorrida_em DESC);

GRANT SELECT, INSERT ON public.lead_conversoes TO authenticated;
GRANT ALL ON public.lead_conversoes TO service_role;
ALTER TABLE public.lead_conversoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lead_conversoes_read" ON public.lead_conversoes;
CREATE POLICY "lead_conversoes_read" ON public.lead_conversoes
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "lead_conversoes_write" ON public.lead_conversoes;
CREATE POLICY "lead_conversoes_write" ON public.lead_conversoes
  FOR INSERT TO authenticated WITH CHECK (public.is_manager(auth.uid()));

COMMENT ON TABLE public.lead_conversoes IS
  'Histórico de conversões do lead, vindo da base de marketing do RD.';
