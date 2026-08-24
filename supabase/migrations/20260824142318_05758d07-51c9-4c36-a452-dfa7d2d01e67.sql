CREATE TABLE public.cs_user_integrations (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  calendly_token text,
  calendly_user_uri text,
  calendly_org_uri text,
  calendly_name text,
  calendly_email text,
  calendly_connected_at timestamptz,
  calendly_last_sync_at timestamptz,
  calendly_last_error text,
  email_address text,
  email_connected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cs_user_integrations TO authenticated;
GRANT ALL ON public.cs_user_integrations TO service_role;
ALTER TABLE public.cs_user_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own integration read" ON public.cs_user_integrations
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own integration insert" ON public.cs_user_integrations
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own integration update" ON public.cs_user_integrations
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own integration delete" ON public.cs_user_integrations
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER cs_user_integrations_touch
  BEFORE UPDATE ON public.cs_user_integrations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.cs_calendly_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_uri text NOT NULL UNIQUE,
  name text,
  status text,
  start_time timestamptz NOT NULL,
  end_time timestamptz,
  location text,
  meeting_url text,
  invitee_name text,
  invitee_email text,
  cancel_reason text,
  client_uid text REFERENCES public.cs_clients(client_uid) ON DELETE SET NULL,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cs_calendly_events_start_idx ON public.cs_calendly_events (start_time);
CREATE INDEX cs_calendly_events_user_idx ON public.cs_calendly_events (user_id, start_time);

GRANT SELECT ON public.cs_calendly_events TO authenticated;
GRANT ALL ON public.cs_calendly_events TO service_role;
ALTER TABLE public.cs_calendly_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "calendly events read" ON public.cs_calendly_events
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_manager(auth.uid()));

CREATE TABLE public.cs_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id text UNIQUE,
  direction text NOT NULL DEFAULT 'inbound',
  from_email text,
  from_name text,
  to_emails text[] NOT NULL DEFAULT '{}',
  cc_emails text[] NOT NULL DEFAULT '{}',
  subject text,
  snippet text,
  body_text text,
  body_html text,
  received_at timestamptz NOT NULL DEFAULT now(),
  client_uid text REFERENCES public.cs_clients(client_uid) ON DELETE SET NULL,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  mailbox text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cs_emails_received_idx ON public.cs_emails (received_at DESC);
CREATE INDEX cs_emails_client_idx ON public.cs_emails (client_uid, received_at DESC);
CREATE INDEX cs_emails_owner_idx ON public.cs_emails (owner_user_id, received_at DESC);

GRANT SELECT ON public.cs_emails TO authenticated;
GRANT ALL ON public.cs_emails TO service_role;
ALTER TABLE public.cs_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cs emails read" ON public.cs_emails
  FOR SELECT TO authenticated
  USING (public.is_manager(auth.uid()) OR public.has_team(auth.uid(), 'cs'));