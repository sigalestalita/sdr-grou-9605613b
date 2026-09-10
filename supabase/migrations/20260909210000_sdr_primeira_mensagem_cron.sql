-- SDR: 1ª mensagem automática após a conversão + motor de automações/FUPs agendado.
--
-- 1. Template de boas-vindas (agradecimento + "logo entramos em contato"). Precisa
--    ser aprovado na Meta com o mesmo nome (provider_template_name) antes de
--    disparar fora da janela de 24 h; até lá fica como 'pending'.
-- 2. Regra "novo lead" apontando para esse template, criada DESATIVADA: a gestão
--    ativa em Inbox → Automações depois de aprovar o template na Meta.
-- 3. pg_cron: o motor de automações (a cada 2 min) e as sequências de FUP (a cada
--    5 min) passam a rodar sozinhos — até aqui nada os disparava em produção.
INSERT INTO public.whatsapp_templates (name, provider_template_name, category, language, body, variables, status)
SELECT 'Boas-vindas inbound (1ª mensagem)', 'boas_vindas_inbound', 'utility', 'pt_BR',
       'Olá {{1}}! Obrigado pelo seu interesse na Grou 😊 Recebemos o seu pedido e em breve um especialista da nossa equipe entra em contato com você. Se preferir adiantar: qual é hoje o principal desafio de gestão de pessoas na sua empresa?',
       '["primeiro_nome"]'::jsonb, 'pending'
WHERE NOT EXISTS (SELECT 1 FROM public.whatsapp_templates WHERE provider_template_name = 'boas_vindas_inbound');

INSERT INTO public.whatsapp_automation_rules (name, trigger_type, trigger_config, template_id, delay_minutes, active)
SELECT '1ª mensagem após conversão (agradecimento)', 'new_lead', '{}'::jsonb,
       (SELECT id FROM public.whatsapp_templates WHERE provider_template_name = 'boas_vindas_inbound' LIMIT 1),
       0, false
WHERE NOT EXISTS (SELECT 1 FROM public.whatsapp_automation_rules WHERE trigger_type = 'new_lead');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('whatsapp-automations-tick', 'whatsapp-run-fups');
    PERFORM cron.schedule('whatsapp-automations-tick', '*/2 * * * *', $cron$
      SELECT net.http_post(
        url := 'https://compass.groupp.com/api/public/whatsapp/automations/tick?token='
               || (SELECT value->>'token' FROM public.cs_settings WHERE key = 'email_inbound'),
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := '{}'::jsonb
      );
    $cron$);
    PERFORM cron.schedule('whatsapp-run-fups', '*/5 * * * *', $cron$
      SELECT net.http_post(
        url := 'https://compass.groupp.com/api/public/hooks/run-fups?token='
               || (SELECT value->>'token' FROM public.cs_settings WHERE key = 'email_inbound'),
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := '{}'::jsonb
      );
    $cron$);
  END IF;
END $$;
