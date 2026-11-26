-- Acervo de slides da apresentação comercial da Grou: cada slide da
-- apresentação vira uma imagem no bucket privado propostas-slides (pasta
-- acervo/<importação>/) com o serviço/produto a que pertence. Na proposta, o
-- comercial escolhe do acervo quais serviços e slides vão para o prospect,
-- em vez de enviar um PDF a cada vez. Quem pode propor também gerencia o
-- acervo (como os modelos de proposta).
CREATE TABLE IF NOT EXISTS public.proposta_acervo_slides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ordem integer NOT NULL,
  -- serviço/produto: grou (institucional), pda, lumi… e o nome mostrado
  programa text NOT NULL,
  secao text NOT NULL,
  titulo text,
  -- URL no formato público do bucket privado; a página do cliente troca por
  -- URL assinada, como já faz com os slides de PDF
  imagem_url text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  -- lote da importação (pasta no bucket); importar de novo troca o acervo,
  -- e as propostas já enviadas continuam apontando para as imagens antigas
  importacao text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS proposta_acervo_slides_ordem_idx
  ON public.proposta_acervo_slides (ordem);

ALTER TABLE public.proposta_acervo_slides ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposta_acervo_slides TO authenticated;
GRANT ALL ON public.proposta_acervo_slides TO service_role;

DROP POLICY IF EXISTS proposta_acervo_slides_all ON public.proposta_acervo_slides;
CREATE POLICY proposta_acervo_slides_all ON public.proposta_acervo_slides
  FOR ALL TO authenticated
  USING (public.pode_propor(auth.uid()))
  WITH CHECK (public.pode_propor(auth.uid()));
