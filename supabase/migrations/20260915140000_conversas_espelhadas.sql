-- Conversa espelhada: a caixa de entrada de um número do time, sem virar lead.
--
-- Com a coexistência, o WhatsApp Business de cada SDR passa a espelhar no
-- sistema. Só que nesse número não escreve só lead: escreve fornecedor,
-- colega, contador, família. Do jeito que estava, cada um viraria um card no
-- pipeline — e, pior, a IA poderia responder a eles se apresentando como a
-- SDR.
--
-- A regra que a gestão escolheu: espelhar a conversa e não criar lead nenhum.
-- Quando a SDR reconhece que aquele contato é lead de verdade, ela promove, e
-- aí sim entra no pipeline.
--
-- Isso exige conversa sem lead, que o desenho original proibia.

ALTER TABLE public.whatsapp_accounts
  ADD COLUMN IF NOT EXISTS espelhada boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.whatsapp_accounts.espelhada IS
  'Número pessoal de trabalho espelhado por coexistência: não cria lead automático e a IA nunca responde.';

-- Conversa pode existir sem lead.
ALTER TABLE public.whatsapp_conversations ALTER COLUMN lead_id DROP NOT NULL;
ALTER TABLE public.whatsapp_messages ALTER COLUMN lead_id DROP NOT NULL;

/*
 * A UNIQUE(lead_id) original vira índice parcial.
 *
 * Continua valendo "uma conversa por lead" — é disso que o código depende ao
 * buscar a conversa de um lead com maybeSingle(). O que muda é que várias
 * conversas sem lead deixam de colidir entre si, porque NULL não conflita em
 * índice parcial que as exclui.
 */
ALTER TABLE public.whatsapp_conversations
  DROP CONSTRAINT IF EXISTS whatsapp_conversations_lead_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_conv_lead_unico
  ON public.whatsapp_conversations (lead_id)
  WHERE lead_id IS NOT NULL;

-- Sem lead, quem identifica a conversa é o par conta + contato.
CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_conv_conta_contato
  ON public.whatsapp_conversations (account_id, contact_id)
  WHERE lead_id IS NULL AND contact_id IS NOT NULL;
