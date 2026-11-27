-- Oferta de horários: o CS reserva 2+ horários e manda um link; o cliente
-- escolhe um (ou o CS marca o escolhido). Cada horário é uma linha de
-- cs_meetings com status 'reservada' e oferta_id; o escolhido vira
-- 'agendada' e os outros são apagados (o horário volta a ficar livre).
CREATE TABLE IF NOT EXISTS public.cs_reuniao_ofertas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  client_uid text NOT NULL REFERENCES public.cs_clients(client_uid) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.cs_contacts(id) ON DELETE SET NULL,
  owner_user_id uuid NOT NULL DEFAULT auth.uid(),
  title text NOT NULL,
  category_id uuid REFERENCES public.cs_meeting_categories(id) ON DELETE SET NULL,
  duration_minutes integer,
  meeting_url text,
  summary text,
  status text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'escolhida', 'cancelada')),
  escolhida_meeting_id uuid,
  escolhida_em timestamptz,
  escolhida_por text CHECK (escolhida_por IN ('cliente', 'cs')),
  escolhida_nome text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cs_reuniao_ofertas_cliente_idx ON public.cs_reuniao_ofertas (client_uid, created_at DESC);
ALTER TABLE public.cs_reuniao_ofertas ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cs_reuniao_ofertas TO authenticated;
GRANT ALL ON public.cs_reuniao_ofertas TO service_role;
DROP POLICY IF EXISTS cs_reuniao_ofertas_all ON public.cs_reuniao_ofertas;
CREATE POLICY cs_reuniao_ofertas_all ON public.cs_reuniao_ofertas FOR ALL TO authenticated
  USING (public.cs_can_see_client(client_uid)) WITH CHECK (public.cs_can_see_client(client_uid));

ALTER TABLE public.cs_meetings
  ADD COLUMN IF NOT EXISTS oferta_id uuid REFERENCES public.cs_reuniao_ofertas(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS cs_meetings_oferta_idx ON public.cs_meetings (oferta_id) WHERE oferta_id IS NOT NULL;
NOTIFY pgrst, 'reload schema';
