CREATE TABLE public.cs_meeting_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  color text NOT NULL DEFAULT 'primary',
  ativo boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cs_meeting_categories TO authenticated;
GRANT ALL ON public.cs_meeting_categories TO service_role;
ALTER TABLE public.cs_meeting_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CS pode gerenciar categorias de reuniao"
  ON public.cs_meeting_categories FOR ALL TO authenticated
  USING (public.can_access_module(auth.uid(), 'cs'))
  WITH CHECK (public.can_access_module(auth.uid(), 'cs'));

CREATE TRIGGER cs_meeting_categories_touch
  BEFORE UPDATE ON public.cs_meeting_categories
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.cs_meetings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_uid text NOT NULL REFERENCES public.cs_clients(client_uid) ON DELETE CASCADE,
  category_id uuid REFERENCES public.cs_meeting_categories(id) ON DELETE SET NULL,
  title text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  duration_minutes integer,
  status text NOT NULL DEFAULT 'realizada',
  attendees text,
  owner_user_id uuid REFERENCES auth.users(id),
  meeting_url text,
  summary text,
  next_step text,
  next_step_at timestamptz,
  calendly_event_id uuid REFERENCES public.cs_calendly_events(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'manual',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX cs_meetings_client_idx ON public.cs_meetings (client_uid, occurred_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cs_meetings TO authenticated;
GRANT ALL ON public.cs_meetings TO service_role;
ALTER TABLE public.cs_meetings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "CS pode gerenciar reunioes"
  ON public.cs_meetings FOR ALL TO authenticated
  USING (public.can_access_module(auth.uid(), 'cs'))
  WITH CHECK (public.can_access_module(auth.uid(), 'cs'));

CREATE TRIGGER cs_meetings_touch
  BEFORE UPDATE ON public.cs_meetings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.cs_meeting_categories (name, slug, color) VALUES
  ('Reunião estratégica', 'reuniao-estrategica', 'primary'),
  ('Construção de cargo', 'construcao-de-cargo', 'emerald'),
  ('Onboarding', 'onboarding', 'sky'),
  ('Alinhamento de renovação', 'alinhamento-renovacao', 'amber'),
  ('Treinamento / capacitação', 'treinamento', 'violet');