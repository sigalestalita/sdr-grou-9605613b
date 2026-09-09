-- CS: e-mails das Jornadas Reais (Bloco 14) — um registro por empresa × marco.
CREATE TABLE IF NOT EXISTS public.cs_journey_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uid text NOT NULL REFERENCES public.cs_clients(client_uid) ON DELETE CASCADE,
  email_id text NOT NULL,
  due_at date NOT NULL,
  -- agendado (futuro) · pendente (no dia, aguardando envio/aprovação) · enviado · pulado · expirado · erro
  status text NOT NULL DEFAULT 'agendado'
    CHECK (status IN ('agendado', 'pendente', 'enviado', 'pulado', 'expirado', 'erro')),
  contact_id uuid REFERENCES public.cs_contacts(id) ON DELETE SET NULL,
  to_email text,
  to_name text,
  subject text,
  sent_at timestamptz,
  sent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  error text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_uid, email_id)
);
CREATE INDEX IF NOT EXISTS idx_cs_journey_due ON public.cs_journey_emails (status, due_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cs_journey_emails TO authenticated;
GRANT ALL ON public.cs_journey_emails TO service_role;
ALTER TABLE public.cs_journey_emails ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cs_journey_all" ON public.cs_journey_emails;
CREATE POLICY "cs_journey_all" ON public.cs_journey_emails FOR ALL TO authenticated
  USING (public.cs_can_see_client(client_uid)) WITH CHECK (public.cs_can_see_client(client_uid));
DROP TRIGGER IF EXISTS cs_journey_touch ON public.cs_journey_emails;
CREATE TRIGGER cs_journey_touch BEFORE UPDATE ON public.cs_journey_emails
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();