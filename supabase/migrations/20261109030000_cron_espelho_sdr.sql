-- Espelho dos funis do SDR separado do sync de leads (junto, a chamada
-- passava do limite de processamento): um funil por chamada, a cada hora.
DO $$
DECLARE i int;
BEGIN
  PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname LIKE 'espelho-sdr-%';
  FOR i IN 0..1 LOOP
    PERFORM cron.schedule(
      'espelho-sdr-' || (i + 1),
      (7 + i * 20) || ' * * * *',
      format($cmd$
        SELECT net.http_post(
          url := 'https://project--773e2ce3-3b97-4224-ac14-c22657fc102a.lovable.app/api/public/hooks/espelho-sdr?token='
                 || (SELECT value->>'token' FROM public.cs_settings WHERE key = 'email_inbound'),
          headers := '{"Content-Type":"application/json"}'::jsonb,
          body := jsonb_build_object('funil', %s),
          timeout_milliseconds := 290000
        );
      $cmd$, i)
    );
  END LOOP;
END $$;
