-- lovable-cron-fallback-reviewed: 1440 runs/day; campanhas de WhatsApp têm horário marcado (scheduled_at) e só o agendamento as dispara; cada rodada sem campanha devida é uma leitura.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'campanhas-agendadas';
    PERFORM cron.schedule('campanhas-agendadas', '* * * * *', $cron$
      SELECT net.http_post(
        url := 'https://project--773e2ce3-3b97-4224-ac14-c22657fc102a.lovable.app/api/public/hooks/campanhas-agendadas?token='
               || (SELECT value->>'token' FROM public.cs_settings WHERE key = 'email_inbound'),
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      );
    $cron$);
  END IF;
END $$;