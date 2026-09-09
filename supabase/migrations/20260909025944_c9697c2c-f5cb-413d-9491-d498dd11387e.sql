-- lovable-cron-fallback-reviewed: 96 runs/day; RD CRM has no webhook for org/deal changes, so incremental polling is the only way to keep data fresh; 15 min matches the required freshness window for lead routing.
INSERT INTO public.cs_settings (key, value)
VALUES ('email_inbound', jsonb_build_object('token', replace(gen_random_uuid()::text, '-', '')))
ON CONFLICT (key) DO UPDATE
  SET value = CASE
    WHEN COALESCE(cs_settings.value->>'token', '') = ''
      THEN cs_settings.value || jsonb_build_object('token', replace(gen_random_uuid()::text, '-', ''))
    ELSE cs_settings.value
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