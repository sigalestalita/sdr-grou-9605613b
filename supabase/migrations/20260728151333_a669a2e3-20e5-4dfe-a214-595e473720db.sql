UPDATE public.app_settings
SET value = jsonb_set(value, '{phones,81068193-826f-42e8-8670-df87fcdfecf5}', '"555194052711"'::jsonb, false),
    updated_at = now()
WHERE key = 'sdr_hot_lead_alert';