-- A primeira mensagem sai no nome do SDR responsável.
--
-- A mensagem antiga dizia "em breve um especialista da nossa equipe vai falar
-- com você". Isso não descreve o que acontece: quando o lead responde, quem
-- atende é o próprio SDR responsável, pelo mesmo número. A promessa de um
-- segundo contato que nunca vem faz a pessoa esperar em vez de conversar.
--
-- O template novo se apresenta pelo nome de quem cuida do lead e já abre a
-- qualificação. {{sdr}} é resolvido em tempo de envio, a partir do
-- assigned_to do lead; sem responsável, cai na assinatura padrão da IA.
--
-- Esta migration é redundante com o botão "Criar templates do sistema" na aba
-- Templates, que faz o mesmo sem depender de SQL aplicado. As duas são
-- idempotentes e pulam o que já existe, então rodar as duas não duplica nada.
--
-- ATENÇÃO: o corpo que a pessoa recebe é o que está APROVADO na Meta, não este.
-- Este texto serve para a pré-visualização no inbox e para o envio à Meta.
-- Depois de aplicar, é preciso enviar o template para aprovação em
-- Inbox → Templates e, quando aprovado, apontar a IA para ele em
-- Inbox → IA → template da primeira mensagem.

INSERT INTO public.whatsapp_templates (name, provider_template_name, category, language, body, variables, status)
SELECT 'Primeiro contato do SDR (empresa)', 'primeiro_contato_sdr', 'utility', 'pt_BR',
       'Oi {{primeiro_nome}}, tudo bem? Aqui é {{sdr}}, da Grou 😊' || chr(10) || chr(10) ||
       'Vi que você buscou nossas soluções de gestão de pessoas e queria entender melhor o seu contexto.' || chr(10) || chr(10) ||
       'Qual é hoje o principal desafio de gestão de pessoas na sua empresa?',
       '["primeiro_nome", "sdr"]'::jsonb, 'pending'
WHERE NOT EXISTS (
  SELECT 1 FROM public.whatsapp_templates WHERE provider_template_name = 'primeiro_contato_sdr'
);

-- De quebra, conserta a pré-visualização do template antigo.
--
-- O corpo estava gravado com {{1}}, mas o renderizador do inbox resolve
-- variáveis por nome ({{primeiro_nome}}). Resultado: a Meta entregava "Olá Ana
-- Paula!" e o inbox mostrava "Olá." — o que faz parecer que o nome não foi.
UPDATE public.whatsapp_templates
   SET body = replace(body, '{{1}}', '{{primeiro_nome}}')
 WHERE body LIKE '%{{1}}%'
   AND variables->>0 = 'primeiro_nome';
