-- Rastreio de visitas à página pública da proposta (/proposta/<token>) e
-- arquivos da apresentação em slides (bucket propostas-slides).
-- Escrita só pelo servidor (service role); leitura para quem pode propor,
-- a mesma regra de leitura de public.propostas.

CREATE TABLE IF NOT EXISTS public.proposta_visitas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposta_id uuid NOT NULL REFERENCES public.propostas(id) ON DELETE CASCADE,
  sessao text NOT NULL,
  iniciada_em timestamptz NOT NULL DEFAULT now(),
  ultima_atividade_em timestamptz,
  segundos integer NOT NULL DEFAULT 0,
  slides_vistos integer[] NOT NULL DEFAULT '{}',
  maior_slide integer NOT NULL DEFAULT 0,
  user_agent text,
  ip text,
  UNIQUE (proposta_id, sessao)
);

CREATE INDEX IF NOT EXISTS proposta_visitas_proposta_idx
  ON public.proposta_visitas (proposta_id, iniciada_em DESC);

GRANT SELECT ON public.proposta_visitas TO authenticated;
GRANT ALL ON public.proposta_visitas TO service_role;

ALTER TABLE public.proposta_visitas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS proposta_visitas_read ON public.proposta_visitas;
CREATE POLICY proposta_visitas_read ON public.proposta_visitas
  FOR SELECT TO authenticated
  USING (public.pode_propor(auth.uid()));

-- Slides da apresentação: quem pode propor envia, troca e apaga.
-- O cliente vê pela página pública, que gera links temporários pelo servidor.
DROP POLICY IF EXISTS propostas_slides_select ON storage.objects;
CREATE POLICY propostas_slides_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'propostas-slides' AND public.pode_propor(auth.uid()));

DROP POLICY IF EXISTS propostas_slides_insert ON storage.objects;
CREATE POLICY propostas_slides_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'propostas-slides' AND public.pode_propor(auth.uid()));

DROP POLICY IF EXISTS propostas_slides_update ON storage.objects;
CREATE POLICY propostas_slides_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'propostas-slides' AND public.pode_propor(auth.uid()))
  WITH CHECK (bucket_id = 'propostas-slides' AND public.pode_propor(auth.uid()));

DROP POLICY IF EXISTS propostas_slides_delete ON storage.objects;
CREATE POLICY propostas_slides_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'propostas-slides' AND public.pode_propor(auth.uid()));
