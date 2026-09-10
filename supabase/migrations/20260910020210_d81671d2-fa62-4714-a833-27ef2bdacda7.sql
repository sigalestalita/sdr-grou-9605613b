-- SDR: no card "Agendado" do Pipeline, além da data da reunião, guardar quando
-- a agenda foi marcada e qual executivo do comercial vai fazer a reunião.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS meeting_booked_at timestamptz,
  ADD COLUMN IF NOT EXISTS executivo_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS leads_executivo_idx ON public.leads (executivo_id) WHERE executivo_id IS NOT NULL;

-- "Marcada em" = momento em que a data da reunião foi definida/alterada.
CREATE OR REPLACE FUNCTION public.leads_stamp_meeting_booked()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.meeting_at IS NOT NULL AND NEW.meeting_at IS DISTINCT FROM OLD.meeting_at THEN
    NEW.meeting_booked_at := now();
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS leads_stamp_meeting_booked ON public.leads;
CREATE TRIGGER leads_stamp_meeting_booked BEFORE UPDATE OF meeting_at ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_stamp_meeting_booked();

-- Retroativo: quem já tem reunião marcada fica com a data de entrada na etapa.
UPDATE public.leads SET meeting_booked_at = COALESCE(stage_entered_at, updated_at)
 WHERE meeting_at IS NOT NULL AND meeting_booked_at IS NULL;