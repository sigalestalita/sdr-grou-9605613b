-- Google Agenda com escrita: cada pessoa autoriza a própria conta (OAuth) e o
-- Compass cria/atualiza/cancela o evento das reuniões. Os tokens ficam só
-- para o servidor (RLS ligado e nenhuma política: só o service role lê).
CREATE TABLE IF NOT EXISTS public.google_agenda_contas (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  refresh_token text NOT NULL,
  access_token text,
  expira_em timestamptz,
  escopo text,
  conectado_em timestamptz NOT NULL DEFAULT now(),
  ultimo_erro text
);
ALTER TABLE public.google_agenda_contas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.google_agenda_contas FROM anon, authenticated;
GRANT ALL ON public.google_agenda_contas TO service_role;

CREATE TABLE IF NOT EXISTS public.google_agenda_estados (
  estado text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  voltar_para text,
  criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.google_agenda_estados ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.google_agenda_estados FROM anon, authenticated;
GRANT ALL ON public.google_agenda_estados TO service_role;

ALTER TABLE public.cs_meetings
  ADD COLUMN IF NOT EXISTS google_event_id text,
  ADD COLUMN IF NOT EXISTS google_event_dono uuid;
NOTIFY pgrst, 'reload schema';
