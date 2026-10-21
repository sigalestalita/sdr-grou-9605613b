-- lovable-cron-fallback-reviewed: 720 runs/day; mesma rotina da 20261021100000, só troca o endereço.
-- O agendamento anterior chamava compass.groupp.com (domínio errado, falha de
-- SSL em toda rodada): a planilha não entrava sozinha no kanban. Passa a usar o
-- endereço do projeto, como os outros crons, e dá 60s para a sincronização.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'sync-planilha-leads';
    PERFORM cron.schedule('sync-planilha-leads', '*/2 * * * *', $cron$
      SELECT net.http_post(
        url := 'https://project--773e2ce3-3b97-4224-ac14-c22657fc102a.lovable.app/api/public/hooks/sync-planilha?token='
               || (SELECT value->>'token' FROM public.cs_settings WHERE key = 'email_inbound'),
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
      );
    $cron$);
  END IF;
END $$;
