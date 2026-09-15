-- Guarda o que chega no webhook e o sistema ainda não sabe tratar.
--
-- Existe por causa da coexistência: quando a Meta habilitar o espelho dos
-- WhatsApp Business do time, vão passar a chegar campos novos no mesmo
-- webhook — o eco das mensagens que o SDR digita no celular, o histórico das
-- conversas antigas, a sincronização de contatos. Hoje o parser só entende
-- "messages" e "statuses", e descarta o resto em silêncio.
--
-- Descartar em silêncio é o problema: sem isso, no dia em que a coexistência
-- for ligada, ninguém consegue dizer se a Meta está mandando alguma coisa, com
-- que nome e com que formato. Esta tabela é o que transforma "acho que não
-- chegou" em "chegou isto aqui".
--
-- Não é fila de reprocessamento: é diagnóstico. Fica pequena de propósito, com
-- limpeza dos registros antigos.

CREATE TABLE IF NOT EXISTS public.whatsapp_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES public.whatsapp_accounts(id) ON DELETE CASCADE,
  -- nome do campo como a Meta manda: message_echoes, smb_message_echoes,
  -- history, smb_app_state_sync, account_update…
  field text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_webhook_events_recentes
  ON public.whatsapp_webhook_events (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_webhook_events_campo
  ON public.whatsapp_webhook_events (field, received_at DESC);

GRANT SELECT ON public.whatsapp_webhook_events TO authenticated;
GRANT ALL ON public.whatsapp_webhook_events TO service_role;
ALTER TABLE public.whatsapp_webhook_events ENABLE ROW LEVEL SECURITY;

-- Só gestão lê: o payload cru pode conter texto de conversa.
DROP POLICY IF EXISTS "wa_webhook_events_manager_read" ON public.whatsapp_webhook_events;
CREATE POLICY "wa_webhook_events_manager_read" ON public.whatsapp_webhook_events
  FOR SELECT TO authenticated USING (public.is_manager(auth.uid()));

COMMENT ON TABLE public.whatsapp_webhook_events IS
  'Eventos de webhook que o parser ainda não trata. Diagnóstico para a habilitação da coexistência.';
