ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS cadence_track text,
  ADD COLUMN IF NOT EXISTS cadence_started_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS cadence_status text NOT NULL DEFAULT 'ativa',
  ADD COLUMN IF NOT EXISTS bant jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS leads_cadence_track_idx ON public.leads (cadence_track);
CREATE INDEX IF NOT EXISTS leads_cadence_status_idx ON public.leads (cadence_status);