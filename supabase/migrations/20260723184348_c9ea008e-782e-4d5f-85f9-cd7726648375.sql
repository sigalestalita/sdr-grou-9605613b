update app_settings
set value = jsonb_set(value, '{phones,81068193-826f-42e8-8670-df87fcdfecf5}', '"555192560545"'::jsonb)
where key='sdr_hot_lead_alert';