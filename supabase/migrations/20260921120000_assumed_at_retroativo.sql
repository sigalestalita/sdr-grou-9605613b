-- Preenche assumed_at/assumed_by_user_id nas conversas que já tiveram uma
-- pessoa escrevendo.
--
-- Marcar quem envia como dono da conversa é recente. Conversa antiga tem
-- mensagem de SDR e assumed_at vazio, e o selo dizia "IA atendendo" numa
-- conversa que a pessoa já estava tocando.
--
-- Antes isso era resolvido varrendo a tabela de mensagens a cada leitura da
-- caixa de entrada, que recarrega a cada 15 segundos — carga constante em cima
-- do banco. Resolvendo de uma vez aqui, a leitura fica de graça.
--
-- Escopo estreito: só onde assumed_at está nulo, e usando a PRIMEIRA mensagem
-- humana da conversa, que é quem de fato assumiu. Nada é sobrescrito.

WITH primeira_humana AS (
  SELECT DISTINCT ON (m.conversation_id)
         m.conversation_id,
         m.sender_user_id,
         m.created_at
    FROM public.whatsapp_messages m
   WHERE m.sender_type IN ('sdr', 'agent', 'human')
   ORDER BY m.conversation_id, m.created_at ASC
)
UPDATE public.whatsapp_conversations c
   SET assumed_at = p.created_at,
       assumed_by_user_id = COALESCE(c.assumed_by_user_id, p.sender_user_id, c.assigned_user_id)
  FROM primeira_humana p
 WHERE p.conversation_id = c.id
   AND c.assumed_at IS NULL;

-- O índice que a consulta da caixa de entrada usa para perguntar por conversa,
-- em vez de varrer a tabela inteira.
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conversa_remetente
    ON public.whatsapp_messages (conversation_id, sender_type);
