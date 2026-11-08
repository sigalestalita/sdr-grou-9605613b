-- A sinaleira atualiza ~1.500 fichas; numa chamada só passa do limite de
-- 5 minutos do servidor. Troca o agendamento único por 5 partes de 400
-- fichas, a cada 6 minutos (07:41 a 08:05 em Brasília). A primeira parte
-- também cria quem falta no CS; as demais só atualizam.
DO $$
DECLARE i int;
BEGIN
  PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname LIKE 'sync-sinaleira%';
  FOR i IN 0..4 LOOP
    PERFORM cron.schedule(
      'sync-sinaleira-' || (i + 1),
      (41 + i * 6) % 60 || ' ' || (10 + (41 + i * 6) / 60) || ' * * *',
      format($cmd$
        SELECT net.http_post(
          url := 'https://project--773e2ce3-3b97-4224-ac14-c22657fc102a.lovable.app/api/public/hooks/sync-sinaleira?token='
                 || (SELECT value->>'token' FROM public.cs_settings WHERE key = 'email_inbound'),
          headers := '{"Content-Type":"application/json"}'::jsonb,
          body := jsonb_build_object('inicio', %s, 'fim', %s, 'createMissing', %s),
          timeout_milliseconds := 290000
        );
      $cmd$, i * 400, (i + 1) * 400, CASE WHEN i = 0 THEN 'true' ELSE 'false' END)
    );
  END LOOP;
END $$;
