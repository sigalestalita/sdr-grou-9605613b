UPDATE public.app_settings
   SET value = jsonb_set(
         value,
         '{ofertas}',
         '[
           {
             "titulo": "Novas licenças PDA acima de 250 créditos",
             "detalhe": "20% de desconto na abertura da licença, para consultorias que fecharem até 30 de setembro.",
             "validoAte": "2026-09-30",
             "publico": "consultoria"
           },
           {
             "titulo": "Novas licenças PDA abaixo de 250 créditos",
             "detalhe": "Abre a licença e ganha uma capacitação Analista PDA ao vivo, para consultorias que fecharem até 30 de setembro.",
             "validoAte": "2026-09-30",
             "publico": "consultoria"
           },
           {
             "titulo": "Novas licenças PDA, sem mínimo de créditos",
             "detalhe": "20% de desconto na abertura da licença, para empresas e pessoa física que fecharem até 30 de setembro.",
             "validoAte": "2026-09-30",
             "publico": "empresa"
           },
           {
             "titulo": "30% em todos os serviços da Grou",
             "detalhe": "Vale para todo o portfólio de workshops, treinamentos e capacitações, incluindo a capacitação Analista PDA ao vivo. Para quem fechar até 30 de setembro.",
             "validoAte": "2026-09-30",
             "publico": "todos"
           }
         ]'::jsonb,
         true
       ),
       updated_at = now()
 WHERE key = 'whatsapp_ai_agent';

INSERT INTO public.app_settings (key, value)
SELECT 'whatsapp_ai_agent', jsonb_build_object('ofertas', '[]'::jsonb)
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'whatsapp_ai_agent');

ALTER TABLE public.whatsapp_templates
  ADD COLUMN IF NOT EXISTS valido_ate date;

COMMENT ON COLUMN public.whatsapp_templates.valido_ate IS
  'Último dia em que o template pode ser disparado. Depois disso o envio automático cai no template sem campanha.';