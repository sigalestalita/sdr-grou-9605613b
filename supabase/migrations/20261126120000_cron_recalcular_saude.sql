-- Recalcula o health score da carteira ativa inteira todo dia às 08:20 em
-- Brasília, depois do sync da sinaleira (07:41–08:05). Sem isso, só a empresa
-- que estava na planilha ou que teve alguma ação era recalculada.
DO $$
BEGIN
  PERFORM cron.unschedule('recalcular-saude') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'recalcular-saude');
  PERFORM cron.schedule(
    'recalcular-saude',
    '20 11 * * *',
    $cmd$
      SELECT net.http_post(
        url := 'https://project--773e2ce3-3b97-4224-ac14-c22657fc102a.lovable.app/api/public/hooks/recalcular-saude?token='
               || (SELECT value->>'token' FROM public.cs_settings WHERE key = 'email_inbound'),
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      );
    $cmd$
  );
END $$;
