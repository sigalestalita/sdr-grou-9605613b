-- A sincronização com o RD só buscava "Leads - Empresa [SDR]": as negociações
-- de Alianças Estratégicas (consultoria) não chegavam aos cards do kanban.
INSERT INTO public.app_settings (key, value)
VALUES ('rd_pipeline', '{"name": "Leads - Empresa [SDR]; Leads - Alianças Estratégicas [SDR]"}'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
