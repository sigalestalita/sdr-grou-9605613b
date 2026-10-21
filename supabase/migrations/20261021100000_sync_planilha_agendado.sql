-- lovable-cron-fallback-reviewed: 720 runs/day; os leads do Meta Ads chegam pela planilha (o Meta não manda webhook para este app) e precisam entrar no kanban do SDR em minutos para o primeiro contato; cada rodada sem linha nova é só uma leitura da planilha.
-- Antes a sincronização só rodava com alguém com o Pipeline aberto: lead que
-- chegava de noite ou no fim de semana esperava até alguém abrir a tela.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'sync-planilha-leads';
    PERFORM cron.schedule('sync-planilha-leads', '*/2 * * * *', $cron$
      SELECT net.http_post(
        url := 'https://compass.groupp.com/api/public/hooks/sync-planilha?token='
               || (SELECT value->>'token' FROM public.cs_settings WHERE key = 'email_inbound'),
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := '{}'::jsonb
      );
    $cron$);
  END IF;
END $$;
