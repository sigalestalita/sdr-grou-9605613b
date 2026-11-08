-- Lê a planilha da sinaleira todo dia (07:41 em Brasília), para as fichas de
-- CS e a sinaleira não dependerem de alguém clicar em "Sincronizar".
DO $$
BEGIN
  PERFORM cron.unschedule('sync-sinaleira') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-sinaleira');
  PERFORM cron.schedule(
    'sync-sinaleira',
    '41 10 * * *',
    $cmd$
      SELECT net.http_post(
        url := 'https://project--773e2ce3-3b97-4224-ac14-c22657fc102a.lovable.app/api/public/hooks/sync-sinaleira?token='
               || (SELECT value->>'token' FROM public.cs_settings WHERE key = 'email_inbound'),
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      );
    $cmd$
  );
END $$;
