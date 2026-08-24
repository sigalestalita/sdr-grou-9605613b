CREATE TYPE public.app_team AS ENUM ('comercial', 'cs');

CREATE TABLE public.user_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team public.app_team NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, team)
);

GRANT SELECT ON public.user_teams TO authenticated;
GRANT ALL ON public.user_teams TO service_role;

ALTER TABLE public.user_teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view teams" ON public.user_teams
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION public.has_team(_user_id uuid, _team public.app_team)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_teams WHERE user_id = _user_id AND team = _team
  )
$$;

CREATE OR REPLACE FUNCTION public.can_access_module(_user_id uuid, _team public.app_team)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_manager(_user_id) OR public.has_team(_user_id, _team)
$$;

INSERT INTO public.user_teams (user_id, team)
SELECT ur.user_id, 'comercial'::public.app_team
FROM public.user_roles ur
WHERE ur.role IN ('sdr', 'executivo')
ON CONFLICT (user_id, team) DO NOTHING;