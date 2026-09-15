ALTER TABLE public.whatsapp_accounts
  ADD COLUMN IF NOT EXISTS espelhada boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.whatsapp_accounts.espelhada IS
  'Número pessoal de trabalho espelhado por coexistência: não cria lead automático e a IA nunca responde.';

ALTER TABLE public.whatsapp_conversations ALTER COLUMN lead_id DROP NOT NULL;
ALTER TABLE public.whatsapp_messages ALTER COLUMN lead_id DROP NOT NULL;

ALTER TABLE public.whatsapp_conversations
  DROP CONSTRAINT IF EXISTS whatsapp_conversations_lead_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_conv_lead_unico
  ON public.whatsapp_conversations (lead_id)
  WHERE lead_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_conv_conta_contato
  ON public.whatsapp_conversations (account_id, contact_id)
  WHERE lead_id IS NULL AND contact_id IS NOT NULL;