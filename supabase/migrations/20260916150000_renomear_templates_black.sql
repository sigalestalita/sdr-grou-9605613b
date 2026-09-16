-- Renomeia os templates da campanha para "OFERTA BLACK".
--
-- Se eles já tiverem sido criados com o nome antigo, renomear aqui evita que o
-- botão "Criar templates do sistema" crie uma segunda cópia — ele pula pelo
-- nome do HSM, e o nome do HSM mudou junto.
--
-- Só mexe em rascunho. Template já enviado à Meta tem o nome registrado lá, e
-- renomear do lado de cá faria o envio apontar para um template que não existe.

UPDATE public.whatsapp_templates
   SET name = 'OFERTA BLACK — primeiro contato (consultoria)',
       provider_template_name = 'oferta_black_consultoria'
 WHERE provider_template_name = 'primeiro_contato_setembro_consultoria'
   AND status = 'draft';

UPDATE public.whatsapp_templates
   SET name = 'OFERTA BLACK — primeiro contato (empresa)',
       provider_template_name = 'oferta_black_empresa'
 WHERE provider_template_name = 'primeiro_contato_setembro_empresa'
   AND status = 'draft';
