-- Negócio congelado: o cliente disse que decide daqui a X meses (orçamento do
-- ano que vem, decisão adiada). Em vez de dar perda por tempo, o executivo
-- congela até uma data: o negócio sai do funil ativo e da previsão, e volta
-- sozinho para ele nessa data, com aviso e próximo passo.

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS congelado_ate date,
  ADD COLUMN IF NOT EXISTS congelado_motivo text,
  ADD COLUMN IF NOT EXISTS congelado_em timestamptz,
  ADD COLUMN IF NOT EXISTS congelado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vezes_congelado smallint NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS deals_congelado_idx ON public.deals (congelado_ate) WHERE congelado_ate IS NOT NULL;

ALTER TABLE public.notificacoes DROP CONSTRAINT IF EXISTS notificacoes_tipo_check;
ALTER TABLE public.notificacoes ADD CONSTRAINT notificacoes_tipo_check CHECK (tipo IN (
  'mencao', 'ganho_para_faturar', 'pendencia_adm', 'pendencia_respondida',
  'requerimento', 'trainer', 'licenca', 'comissao', 'contrato', 'turma', 'carteira', 'proposta', 'ficha',
  'conta_azul', 'negocio_retomado'
));

-- Chegou a data: descongela, deixa o próximo passo para hoje e avisa o executivo.
CREATE OR REPLACE FUNCTION public.descongelar_negocios()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE n integer := 0; r record;
BEGIN
  FOR r IN
    SELECT id, nome, executivo_user_id, congelado_motivo
      FROM public.deals
     WHERE congelado_ate IS NOT NULL
       AND congelado_ate <= (now() AT TIME ZONE 'America/Sao_Paulo')::date
       AND status = 'open'
  LOOP
    UPDATE public.deals
       SET congelado_ate = NULL,
           proximo_passo = left('Retomar a negociação (estava congelada: ' || coalesce(r.congelado_motivo, 'sem motivo') || ')', 500),
           proximo_passo_em = now(),
           updated_at = now()
     WHERE id = r.id;
    INSERT INTO public.deal_activities (deal_id, tipo, descricao)
    VALUES (r.id, 'nota', 'Negócio descongelado automaticamente na data combinada.');
    IF r.executivo_user_id IS NOT NULL THEN
      INSERT INTO public.notificacoes (user_id, tipo, titulo, corpo, link, deal_id)
      VALUES (r.executivo_user_id, 'negocio_retomado',
              left('Hora de retomar: ' || coalesce(r.nome, 'negócio'), 200),
              left('O negócio estava congelado até hoje. Motivo: ' || coalesce(r.congelado_motivo, '—'), 2000),
              '/negocio/' || r.id, r.id);
    END IF;
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.descongelar_negocios() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.descongelar_negocios() TO service_role;

DO $$
BEGIN
  PERFORM cron.unschedule('descongelar-negocios') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'descongelar-negocios');
  -- 07:17 em Brasília, todo dia.
  PERFORM cron.schedule('descongelar-negocios', '17 10 * * *', 'SELECT public.descongelar_negocios()');
END $$;
