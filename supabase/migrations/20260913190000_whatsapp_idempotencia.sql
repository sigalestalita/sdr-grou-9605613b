-- WhatsApp: uma mensagem da Meta entra uma vez só.
--
-- A Meta reentrega o webhook quando não recebe 200 rápido, e às vezes entrega
-- em duplicidade mesmo sem erro. Como o webhook inseria a mensagem sem checar
-- se já tinha chegado, cada reentrega criava:
--   * um balão repetido do lead na conversa;
--   * uma nova resposta da IA, porque o gatilho roda por mensagem recebida.
-- O resultado aparecia como duas respostas quase iguais, com texto diferente
-- só porque o modelo não é determinístico. Parecia conflito com outro agente,
-- mas era a mesma mensagem processada duas vezes.
--
-- Aqui as duplicatas antigas são removidas e o banco passa a recusar a
-- segunda entrada do mesmo id da Meta.

-- ---------------------------------------------------------------------------
-- 1. Limpa o que já duplicou, mantendo a primeira ocorrência
-- ---------------------------------------------------------------------------
WITH ranqueadas AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY provider_message_id
           ORDER BY created_at, id
         ) AS posicao
    FROM public.whatsapp_messages
   WHERE provider_message_id IS NOT NULL
     AND provider_message_id <> ''
),
sobrando AS (
  SELECT id FROM ranqueadas WHERE posicao > 1
)
-- solta as referências antes de apagar
UPDATE public.whatsapp_automation_logs
   SET message_id = NULL
 WHERE message_id IN (SELECT id FROM sobrando);

WITH ranqueadas AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY provider_message_id
           ORDER BY created_at, id
         ) AS posicao
    FROM public.whatsapp_messages
   WHERE provider_message_id IS NOT NULL
     AND provider_message_id <> ''
)
DELETE FROM public.whatsapp_messages
 WHERE id IN (SELECT id FROM ranqueadas WHERE posicao > 1);

-- ---------------------------------------------------------------------------
-- 2. A partir de agora, o mesmo id da Meta não entra duas vezes
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_msg_provider_unico
  ON public.whatsapp_messages (provider_message_id)
  WHERE provider_message_id IS NOT NULL AND provider_message_id <> '';

COMMENT ON INDEX public.idx_wa_msg_provider_unico IS
  'Idempotência do webhook: a Meta reentrega a mesma mensagem, e sem isso cada reentrega virava um balão repetido e uma nova resposta da IA.';
