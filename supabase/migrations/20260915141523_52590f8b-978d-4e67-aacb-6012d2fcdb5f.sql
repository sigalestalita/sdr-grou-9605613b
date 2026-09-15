CREATE TABLE IF NOT EXISTS public.whatsapp_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES public.whatsapp_accounts(id) ON DELETE CASCADE,
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

DROP POLICY IF EXISTS "wa_webhook_events_manager_read" ON public.whatsapp_webhook_events;
CREATE POLICY "wa_webhook_events_manager_read" ON public.whatsapp_webhook_events
  FOR SELECT TO authenticated USING (public.is_manager(auth.uid()));

COMMENT ON TABLE public.whatsapp_webhook_events IS
  'Eventos de webhook que o parser ainda não trata. Diagnóstico para a habilitação da coexistência.';