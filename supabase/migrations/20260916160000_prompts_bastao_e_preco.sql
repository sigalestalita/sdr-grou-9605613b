-- Corrige dois comportamentos que apareceram no ensaio da IA.
--
-- 1) Bastão precoce. O lead respondeu "desenvolvimento" — uma palavra — e a IA
--    já transferiu. Nada foi qualificado, e o atendimento automático não serviu
--    para nada. A instrução antiga mandava transferir com "intenção comercial
--    clara" e "conversa madura", e o modelo leu qualquer interesse como isso.
--
-- 2) Preço virando bastão. A regra antiga mandava transferir quando o lead
--    pedisse valores. Isso fazia sentido quando a IA não tinha preço nenhum
--    para dar; agora tem — é a campanha de setembro, e o objetivo dela é
--    justamente acelerar a resposta. Transferir nessa hora joga fora a oferta.
--
-- Os dois textos ficam em app_settings, então mudar o padrão no código não
-- alcança o que já está salvo. Daí a migration.

UPDATE public.app_settings
   SET value = value
       || jsonb_build_object(
            'handoffPrompt',
            'Passe o bastão quando: o lead pedir para falar com uma pessoa; pedir para marcar reunião, agenda ou demonstração; pedir proposta, contrato ou negociação; ou quando você já souber o motivo da conversão, o contexto e o momento dele. NÃO passe o bastão só porque o lead disse o interesse em uma palavra, nem porque perguntou preço. Preço de campanha vigente é assunto seu: responda com a condição que você conhece e siga qualificando. Antes do bastão, é obrigatório ter feito ao menos duas perguntas de qualificação e ter as respostas.',
            'replyPrompt',
            'Responda a última mensagem do lead de forma curta e consultiva, uma pergunta por vez. Priorize: 1) entender o motivo da conversão e a dor principal, 2) qualificar perfil, contexto e timing, 3) só então avançar para o atendimento comercial. Resposta de uma palavra não é qualificação: aprofunde antes de seguir. Se o lead perguntar preço e houver condição vigente, diga a condição e aproveite para entender o cenário dele. Se o lead pedir humano, reconheça e conduza para o handoff.'
          ),
       updated_at = now()
 WHERE key = 'whatsapp_ai_agent';

-- Tom: a conversa já começou com o template.
--
-- Depois de o lead responder, a IA cumprimentava de novo ("Olá, Ana Paula!"),
-- agradecia a resposta e explicava o próprio raciocínio antes de perguntar. É
-- o que mais denuncia robô numa conversa de WhatsApp: parece que ninguém leu o
-- que veio antes.
--
-- O guia de tom fica salvo em app_settings, então o padrão do código não
-- alcança o que já está lá.

UPDATE public.app_settings
   SET value = value
       || jsonb_build_object(
            'toneGuide',
            'Tom de SDR sênior: consultivo, humano, seguro, curto e direto no WhatsApp. A conversa já começou com a mensagem de abertura, então não cumprimente de novo nem repita seu nome — vá direto ao ponto. Nada de "que ótimo que você respondeu", "para que eu possa entender melhor" ou "assim consigo direcionar nossa conversa": faça a pergunta. Uma ideia por mensagem, no máximo duas frases curtas.'
          ),
       updated_at = now()
 WHERE key = 'whatsapp_ai_agent';
