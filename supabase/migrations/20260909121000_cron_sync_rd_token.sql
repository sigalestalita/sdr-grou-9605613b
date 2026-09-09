-- Os hooks públicos passaram a exigir o token de integrações (cs_settings
-- 'email_inbound'.token). O pg_cron que dispara o sync incremental do RD a
-- cada 15 min enviava só a apikey anônima do Supabase, que é pública —
-- reagendado enviando o token, lido do banco na hora da chamada.

-- Garante que o token exista mesmo que ninguém tenha aberto Integrações CS.
INSERT INTO public.cs_settings (key, value)
VALUES ('email_inbound', jsonb_build_object('token', replace(gen_random_uuid()::text, '-', '')))
ON CONFLICT (key) DO UPDATE
  SET value = CASE
    WHEN COALESCE(public.cs_settings.value->>'token', '') = ''
      THEN public.cs_settings.value || jsonb_build_object('token', replace(gen_random_uuid()::text, '-', ''))
    ELSE public.cs_settings.value
  END;

DO $$
BEGIN
  PERFORM cron.unschedule('sync-rd-incremental');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'sync-rd-incremental',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--773e2ce3-3b97-4224-ac14-c22657fc102a.lovable.app/api/public/hooks/sync-rd?token='
           || (SELECT value->>'token' FROM public.cs_settings WHERE key = 'email_inbound'),
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{"mode":"incremental"}'::jsonb
  );
  $$
);
