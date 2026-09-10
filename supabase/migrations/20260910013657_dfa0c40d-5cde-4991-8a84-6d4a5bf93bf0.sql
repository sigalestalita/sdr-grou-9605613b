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