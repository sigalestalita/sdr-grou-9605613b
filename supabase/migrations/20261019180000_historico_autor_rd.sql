-- Histórico do RD: guarda o nome do autor como veio do RD. Quem ainda não tem
-- usuário no CRM fica com author_id vazio; quando a gestão criar o usuário ou
-- definir a regra de dono, "Reaplicar donos" preenche o autor por este nome.
ALTER TABLE public.deal_activities ADD COLUMN IF NOT EXISTS rd_autor text;
CREATE INDEX IF NOT EXISTS idx_deal_activities_rd_autor_pendente
  ON public.deal_activities (rd_autor) WHERE author_id IS NULL AND rd_autor IS NOT NULL;
