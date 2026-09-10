-- SDR → Executivo: convite de reunião e passada de bastão.
--
-- Quando o SDR marca a reunião de um lead com um executivo comercial, o próprio
-- SDR dispara o convite (e-mail com .ics) para o lead e para o executivo, e o
-- executivo recebe um e-mail do sistema com a reunião e o contexto do lead
-- (BANT, observações, resumo da conversa). A disponibilidade do executivo vem
-- da Google Agenda dele (cs_user_integrations.gcal_ics_url → cs_calendly_events).

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS meeting_duration_min integer;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS meeting_invite_uid text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS meeting_invite_sequence integer NOT NULL DEFAULT 0;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS meeting_invite_sent_at timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS meeting_handoff text;

-- link fixo de reunião de cada pessoa (Google Meet / Zoom pessoal), usado no convite
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
