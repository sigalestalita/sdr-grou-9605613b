CREATE TABLE public.cs_cadence_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uid text NOT NULL REFERENCES public.cs_clients(client_uid) ON DELETE CASCADE,
  week_start date NOT NULL,
  weekday integer NOT NULL DEFAULT 1,
  owner_id uuid REFERENCES auth.users(id),
  title text NOT NULL DEFAULT '',
  urgency text NOT NULL DEFAULT 'normal',
  color text NOT NULL DEFAULT 'sem_dado',
  done boolean NOT NULL DEFAULT false,
  done_at timestamptz,
  done_by uuid REFERENCES auth.users(id),
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_uid, week_start)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cs_cadence_tasks TO authenticated;
GRANT ALL ON public.cs_cadence_tasks TO service_role;

ALTER TABLE public.cs_cadence_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados gerenciam tarefas de cadencia"
ON public.cs_cadence_tasks FOR ALL TO authenticated
USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE TRIGGER cs_cadence_tasks_touch BEFORE UPDATE ON public.cs_cadence_tasks
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX cs_cadence_tasks_week_idx ON public.cs_cadence_tasks (week_start, owner_id);