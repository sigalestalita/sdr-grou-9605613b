INSERT INTO public.whatsapp_templates
  (name, provider_template_name, category, language, body, variables, footer_text, header_text, header_type, buttons, status, valido_ate)
SELECT 'OFERTA BLACK — primeiro contato (consultoria)', 'oferta_black_consultoria', 'marketing', 'pt_BR',
  'Oi {{primeiro_nome}}, tudo bem? Aqui é {{sdr}}, da Grou 😊

Vi que você buscou a gente. Você atende clientes como consultor ou é pra sua própria empresa?

Ah, e até dia 30 a abertura de licença PDA está com 20% off acima de 250 créditos — abaixo disso, a licença vem com uma capacitação Analista PDA ao vivo. Os treinamentos, com 30%.',
  '["primeiro_nome","sdr"]'::jsonb, NULL, NULL, NULL, '[]'::jsonb, 'draft', '2026-09-30'
WHERE NOT EXISTS (
  SELECT 1 FROM public.whatsapp_templates
   WHERE provider_template_name IN ('oferta_black_consultoria','primeiro_contato_setembro_consultoria')
);

INSERT INTO public.whatsapp_templates
  (name, provider_template_name, category, language, body, variables, footer_text, header_text, header_type, buttons, status, valido_ate)
SELECT 'OFERTA BLACK — primeiro contato (empresa)', 'oferta_black_empresa', 'marketing', 'pt_BR',
  'Oi {{primeiro_nome}}, tudo bem? Aqui é {{sdr}}, da Grou 😊

Vi que você buscou a gente pra gestão de pessoas. Qual é o maior desafio aí hoje?

Ah, e até dia 30 a abertura de licença PDA está com 20% off, e os treinamentos com 30%.',
  '["primeiro_nome","sdr"]'::jsonb, NULL, NULL, NULL, '[]'::jsonb, 'draft', '2026-09-30'
WHERE NOT EXISTS (
  SELECT 1 FROM public.whatsapp_templates
   WHERE provider_template_name IN ('oferta_black_empresa','primeiro_contato_setembro_empresa')
);