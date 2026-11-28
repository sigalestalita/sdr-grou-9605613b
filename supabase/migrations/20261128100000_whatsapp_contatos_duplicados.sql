-- O mesmo número chegou a ter mais de um contato do WhatsApp (gravado como 5551999969371, 555199969371 e
-- 51999969371 antes da phone_key existir). A busca pegava um deles ao acaso e cada mensagem abria uma conversa
-- nova no número espelhado (a mesma pessoa aparecia três vezes na caixa). Junta tudo no contato mais antigo de
-- cada número: primeiro as conversas sem lead do mesmo número na mesma conta (mensagens e tickets vão para a
-- mais antiga), depois os contatos.

-- 1) Conversas sem lead do mesmo número na mesma conta → a mais antiga.
WITH conv AS (
  SELECT c.id, c.account_id, ct.phone_key, c.created_at,
         first_value(c.id) OVER (PARTITION BY c.account_id, ct.phone_key ORDER BY c.created_at, c.id) AS fica
  FROM public.whatsapp_conversations c
  JOIN public.whatsapp_contacts ct ON ct.id = c.contact_id
  WHERE c.lead_id IS NULL AND ct.phone_key IS NOT NULL
), sai AS (SELECT id, fica FROM conv WHERE id <> fica),
m AS (UPDATE public.whatsapp_messages w SET conversation_id = sai.fica FROM sai WHERE w.conversation_id = sai.id RETURNING 1),
t AS (UPDATE public.cs_tickets k SET conversation_id = sai.fica FROM sai WHERE k.conversation_id = sai.id RETURNING 1)
SELECT (SELECT count(*) FROM m) AS mensagens, (SELECT count(*) FROM t) AS tickets;

WITH conv AS (
  SELECT c.id,
         first_value(c.id) OVER (PARTITION BY c.account_id, ct.phone_key ORDER BY c.created_at, c.id) AS fica
  FROM public.whatsapp_conversations c
  JOIN public.whatsapp_contacts ct ON ct.id = c.contact_id
  WHERE c.lead_id IS NULL AND ct.phone_key IS NOT NULL
), sai AS (SELECT id, fica FROM conv WHERE id <> fica),
ultima AS (
  SELECT sai.fica, max(c.last_message_at) AS last_message_at, sum(c.unread_count) AS unread
  FROM sai JOIN public.whatsapp_conversations c ON c.id = sai.id GROUP BY 1
)
UPDATE public.whatsapp_conversations c
SET last_message_at = greatest(c.last_message_at, u.last_message_at),
    unread_count = c.unread_count + u.unread,
    last_preview = coalesce((SELECT w.body FROM public.whatsapp_messages w WHERE w.conversation_id = c.id
                             ORDER BY w.created_at DESC LIMIT 1), c.last_preview)
FROM ultima u WHERE c.id = u.fica;

DELETE FROM public.whatsapp_conversations c
USING (
  SELECT c2.id,
         first_value(c2.id) OVER (PARTITION BY c2.account_id, ct.phone_key ORDER BY c2.created_at, c2.id) AS fica
  FROM public.whatsapp_conversations c2
  JOIN public.whatsapp_contacts ct ON ct.id = c2.contact_id
  WHERE c2.lead_id IS NULL AND ct.phone_key IS NOT NULL
) d
WHERE c.id = d.id AND d.id <> d.fica;

-- 2) Contatos do mesmo número → o mais antigo (fica com o nome e o lead de quem tiver, se faltar).
WITH dup AS (
  SELECT id, phone_key,
         first_value(id) OVER (PARTITION BY phone_key ORDER BY created_at, id) AS fica
  FROM public.whatsapp_contacts WHERE phone_key IS NOT NULL
), sai AS (SELECT id, fica FROM dup WHERE id <> fica),
completa AS (
  UPDATE public.whatsapp_contacts f
  SET name = coalesce(f.name, (SELECT c.name FROM public.whatsapp_contacts c JOIN sai ON sai.id = c.id
                               WHERE sai.fica = f.id AND c.name IS NOT NULL ORDER BY c.updated_at DESC LIMIT 1)),
      lead_id = coalesce(f.lead_id, (SELECT c.lead_id FROM public.whatsapp_contacts c JOIN sai ON sai.id = c.id
                                     WHERE sai.fica = f.id AND c.lead_id IS NOT NULL ORDER BY c.created_at LIMIT 1)),
      last_message_at = greatest(f.last_message_at, (SELECT max(c.last_message_at) FROM public.whatsapp_contacts c
                                                     JOIN sai ON sai.id = c.id WHERE sai.fica = f.id))
  WHERE f.id IN (SELECT fica FROM sai)
  RETURNING 1
)
UPDATE public.whatsapp_conversations c SET contact_id = sai.fica FROM sai WHERE c.contact_id = sai.id;

DELETE FROM public.whatsapp_contacts w
USING (
  SELECT id, first_value(id) OVER (PARTITION BY phone_key ORDER BY created_at, id) AS fica
  FROM public.whatsapp_contacts WHERE phone_key IS NOT NULL
) d
WHERE w.id = d.id AND d.id <> d.fica;
