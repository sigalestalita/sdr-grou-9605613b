-- Histórico completo do RD Marketing: a cada minuto busca, pela API, as
-- conversões e oportunidades de até 100 leads ainda sem histórico. Quando não
-- há pendentes, a chamada só conta e sai. (Aplicado direto no banco em
-- 09/11; este arquivo registra o agendamento.)
DO $$
BEGIN
  PERFORM cron.unschedule('rdm-historico') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rdm-historico');
  PERFORM cron.schedule('rdm-historico', '* * * * *', $cmd$
    SELECT net.http_post(
      url := 'https://project--773e2ce3-3b97-4224-ac14-c22657fc102a.lovable.app/api/public/hooks/rd-migracao?token='
             || (SELECT value->>'token' FROM public.cs_settings WHERE key = 'email_inbound'),
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{"acao":"rdm_eventos","limite":100}'::jsonb,
      timeout_milliseconds := 55000
    );
  $cmd$);
END $$;
