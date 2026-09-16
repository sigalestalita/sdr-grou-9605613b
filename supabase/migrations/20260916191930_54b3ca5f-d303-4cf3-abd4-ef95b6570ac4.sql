UPDATE public.app_settings
   SET value = value || jsonb_build_object('initialTemplateId', 'b6338aa3-4689-40b9-93c6-9650bc965c17'),
       updated_at = now()
 WHERE key = 'whatsapp_ai_agent';