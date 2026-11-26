-- Reunião do CS com uma pessoa do cliente: agendar pela ficha (status
-- "agendada", quantas por dia precisar) escolhendo o contato, e ver na agenda
-- do CS junto com a Google Agenda.
ALTER TABLE public.cs_meetings
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.cs_contacts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS cs_meetings_occurred_idx ON public.cs_meetings (occurred_at);
CREATE INDEX IF NOT EXISTS cs_meetings_owner_idx ON public.cs_meetings (owner_user_id, occurred_at);
NOTIFY pgrst, 'reload schema';
