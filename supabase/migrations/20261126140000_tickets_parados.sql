-- Ticket parado: aviso no sino para o responsável quando um ticket em aberto
-- fica 72 horas sem movimento (pedido do time de CS no treinamento: "o PDA
-- não me retornou e eu esqueci"). Roda todo dia às 08:30 em Brasília.

-- Tipo novo de notificação.
ALTER TABLE public.notificacoes DROP CONSTRAINT IF EXISTS notificacoes_tipo_check;
ALTER TABLE public.notificacoes ADD CONSTRAINT notificacoes_tipo_check CHECK (tipo IN (
  'mencao', 'ganho_para_faturar', 'pendencia_adm', 'pendencia_respondida',
  'requerimento', 'trainer', 'licenca', 'comissao', 'contrato', 'turma', 'carteira', 'proposta', 'ficha',
  'conta_azul', 'negocio_retomado', 'ticket'
));

-- Quando o aviso saiu: avisa uma vez por parada. Se o ticket mexer
-- (updated_at depois do aviso) e parar de novo, avisa outra vez.
ALTER TABLE public.cs_tickets ADD COLUMN IF NOT EXISTS parado_avisado_em timestamptz;

DO $$
BEGIN
  PERFORM cron.unschedule('tickets-parados') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'tickets-parados');
  PERFORM cron.schedule(
    'tickets-parados',
    '30 11 * * *',
    $cmd$
      SELECT net.http_post(
        url := 'https://project--773e2ce3-3b97-4224-ac14-c22657fc102a.lovable.app/api/public/hooks/tickets-parados?token='
               || (SELECT value->>'token' FROM public.cs_settings WHERE key = 'email_inbound'),
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
      );
    $cmd$
  );
END $$;
