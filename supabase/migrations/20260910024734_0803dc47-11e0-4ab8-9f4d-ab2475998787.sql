ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS meeting_duration_min integer;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS meeting_invite_uid text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS meeting_invite_sequence integer NOT NULL DEFAULT 0;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS meeting_invite_sent_at timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS meeting_handoff text;

ALTER TABLE public.cs_user_integrations ADD COLUMN IF NOT EXISTS meeting_url text;

CREATE TABLE IF NOT EXISTS public.lead_meeting_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  uid text NOT NULL,
  sequence integer NOT NULL DEFAULT 0,
  method text NOT NULL DEFAULT 'REQUEST' CHECK (method IN ('REQUEST', 'CANCEL')),
  meeting_at timestamptz NOT NULL,
  duration_min integer NOT NULL DEFAULT 45,
  executivo_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sdr_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  to_emails text[] NOT NULL DEFAULT '{}',
  handoff text,
  invite_message_id text,
  briefing_message_id text,
  briefing_sent_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_meeting_invites_lead ON public.lead_meeting_invites (lead_id, created_at DESC);
GRANT SELECT ON public.lead_meeting_invites TO authenticated;
GRANT ALL ON public.lead_meeting_invites TO service_role;
ALTER TABLE public.lead_meeting_invites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lead_meeting_invites_read" ON public.lead_meeting_invites;
CREATE POLICY "lead_meeting_invites_read" ON public.lead_meeting_invites FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);