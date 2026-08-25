CREATE TABLE public.cs_playbook_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL,
  titulo text NOT NULL,
  corpo text NOT NULL,
  cor text NOT NULL DEFAULT 'geral',
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cs_playbook_blocks TO authenticated;
GRANT ALL ON public.cs_playbook_blocks TO service_role;

ALTER TABLE public.cs_playbook_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "playbook readable by authenticated"
  ON public.cs_playbook_blocks FOR SELECT TO authenticated USING (true);

CREATE POLICY "playbook managed by managers"
  ON public.cs_playbook_blocks FOR ALL TO authenticated
  USING (public.is_manager(auth.uid()))
  WITH CHECK (public.is_manager(auth.uid()));

CREATE TRIGGER cs_playbook_blocks_touch
  BEFORE UPDATE ON public.cs_playbook_blocks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX cs_playbook_blocks_tipo_idx ON public.cs_playbook_blocks (tipo, ordem);