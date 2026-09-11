-- Templates de retomada (HSM) para quando a janela de 24h fecha.
--
-- Fora da janela o WhatsApp só entrega template aprovado. Estes três cobrem os
-- casos do dia a dia do SDR e entram como RASCUNHO: a gestão revisa o texto em
-- WhatsApp → Templates e clica em enviar para aprovação da Meta.
--
-- Formato esperado pelo sistema:
--   * body usa variável por nome ({{primeiro_nome}}); na hora de enviar para a
--     Meta o sistema converte para {{1}}, {{2}}… na ordem de "variables".
--   * só existem nome, primeiro_nome e empresa. Aqui usamos apenas
--     primeiro_nome: "empresa" vem vazia em lead pessoa física e variável vazia
--     é motivo de recusa na Meta.
--   * a Meta recusa corpo que começa ou termina em variável — todos começam
--     com "Oi " e terminam em pergunta.
--
-- Por que todos têm botão de resposta rápida: quando a pessoa toca no botão,
-- aquilo conta como mensagem recebida e REABRE a janela de 24h. A partir daí o
-- SDR volta a conversar livremente, sem gastar outro template.
--
-- Categoria: a Meta cobra e classifica por categoria. Retomada e oferta de
-- material são marketing. O remarcar trata de um compromisso já combinado com a
-- pessoa, o que se enquadra em utility. A Meta pode reclassificar na análise.

-- 1. Retomada de contato — lead esfriou e ninguém respondeu
INSERT INTO public.whatsapp_templates
  (name, provider_template_name, category, language, body, variables, footer_text, buttons, status)
SELECT
  'Retomada de contato',
  'retomada_contato',
  'marketing',
  'pt_BR',
  E'Oi {{primeiro_nome}}, aqui é a Grou. Você pediu para conhecer o PDA Assessment, nossa análise de perfil comportamental para gestão de pessoas, e ficamos sem retorno seu.\n\nQuer retomar a conversa de onde paramos?',
  '["primeiro_nome"]'::jsonb,
  'Se preferir, é só responder por aqui',
  '[{"type":"QUICK_REPLY","text":"Quero retomar"},{"type":"QUICK_REPLY","text":"Não quero contato"}]'::jsonb,
  'draft'
WHERE NOT EXISTS (
  SELECT 1 FROM public.whatsapp_templates
   WHERE provider_template_name = 'retomada_contato'
);

-- 2. Remarcar reunião — agenda marcada em que o lead não apareceu
INSERT INTO public.whatsapp_templates
  (name, provider_template_name, category, language, body, variables, footer_text, buttons, status)
SELECT
  'Remarcar reunião',
  'remarcar_reuniao',
  'utility',
  'pt_BR',
  E'Oi {{primeiro_nome}}, tudo bem? Não consegui falar com você no horário que tínhamos combinado para apresentar o PDA Assessment.\n\nPodemos remarcar? Me diga um dia e um horário que funcionem melhor para você.',
  '["primeiro_nome"]'::jsonb,
  NULL,
  '[{"type":"QUICK_REPLY","text":"Quero remarcar"},{"type":"QUICK_REPLY","text":"Não tenho interesse"}]'::jsonb,
  'draft'
WHERE NOT EXISTS (
  SELECT 1 FROM public.whatsapp_templates
   WHERE provider_template_name = 'remarcar_reuniao'
);

-- 3. Envio de material — abre espaço para mandar o vídeo do PDA
INSERT INTO public.whatsapp_templates
  (name, provider_template_name, category, language, body, variables, footer_text, buttons, status)
SELECT
  'Envio de material do PDA',
  'envio_material_pda',
  'marketing',
  'pt_BR',
  E'Oi {{primeiro_nome}}, separei um vídeo curto que mostra como o PDA Assessment mapeia o perfil comportamental do time e ajuda nas decisões de gestão.\n\nPosso te mandar o material por aqui?',
  '["primeiro_nome"]'::jsonb,
  'Se preferir, é só responder por aqui',
  '[{"type":"QUICK_REPLY","text":"Pode mandar"},{"type":"QUICK_REPLY","text":"Agora não"}]'::jsonb,
  'draft'
WHERE NOT EXISTS (
  SELECT 1 FROM public.whatsapp_templates
   WHERE provider_template_name = 'envio_material_pda'
);
