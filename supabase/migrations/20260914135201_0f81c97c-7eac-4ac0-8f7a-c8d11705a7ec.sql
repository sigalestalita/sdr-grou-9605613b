-- WhatsApp: uma mensagem da Meta entra uma vez só.
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_msg_provider_unico
  ON public.whatsapp_messages (provider_message_id)
  WHERE provider_message_id IS NOT NULL AND provider_message_id <> '';

COMMENT ON INDEX public.idx_wa_msg_provider_unico IS
  'Idempotência do webhook: a Meta reentrega a mesma mensagem, e sem isso cada reentrega virava um balão repetido e uma nova resposta da IA.';