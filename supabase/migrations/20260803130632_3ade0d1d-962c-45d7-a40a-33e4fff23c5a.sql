CREATE TABLE public.lead_touches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  touch_number integer NOT NULL DEFAULT 0,
  author_id uuid REFERENCES auth.users(id),
  channel text NOT NULL,
  action_type text NOT NULL,
  outcome text NOT NULL,
  notes text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  next_follow_up_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX lead_touches_lead_idx ON public.lead_touches(lead_id, occurred_at DESC);
CREATE INDEX lead_touches_author_idx ON public.lead_touches(author_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_touches TO authenticated;
GRANT ALL ON public.lead_touches TO service_role;

ALTER TABLE public.lead_touches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth can view touches" ON public.lead_touches
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "auth can insert touches" ON public.lead_touches
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "author or manager can update touches" ON public.lead_touches
  FOR UPDATE TO authenticated USING (author_id = auth.uid() OR public.is_manager(auth.uid()));
CREATE POLICY "author or manager can delete touches" ON public.lead_touches
  FOR DELETE TO authenticated USING (author_id = auth.uid() OR public.is_manager(auth.uid()));

CREATE TRIGGER lead_touches_touch_updated_at BEFORE UPDATE ON public.lead_touches
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS touch_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_touch_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_touch_channel text,
  ADD COLUMN IF NOT EXISTS last_touch_outcome text,
  ADD COLUMN IF NOT EXISTS next_follow_up_at timestamptz;

CREATE OR REPLACE FUNCTION public.assign_touch_number()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.touch_number IS NULL OR NEW.touch_number <= 0 THEN
    SELECT COALESCE(MAX(touch_number), 0) + 1 INTO NEW.touch_number
    FROM public.lead_touches WHERE lead_id = NEW.lead_id;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER lead_touches_assign_number BEFORE INSERT ON public.lead_touches
  FOR EACH ROW EXECUTE FUNCTION public.assign_touch_number();

CREATE OR REPLACE FUNCTION public.sync_lead_touch_summary()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lead uuid := COALESCE(NEW.lead_id, OLD.lead_id);
BEGIN
  UPDATE public.leads l SET
    touch_count = s.cnt,
    last_touch_at = s.last_at,
    last_touch_channel = s.last_channel,
    last_touch_outcome = s.last_outcome,
    next_follow_up_at = s.next_fu
  FROM (
    SELECT
      COUNT(*) AS cnt,
      MAX(occurred_at) AS last_at,
      (SELECT channel FROM public.lead_touches WHERE lead_id = v_lead ORDER BY occurred_at DESC LIMIT 1) AS last_channel,
      (SELECT outcome FROM public.lead_touches WHERE lead_id = v_lead ORDER BY occurred_at DESC LIMIT 1) AS last_outcome,
      (SELECT MIN(next_follow_up_at) FROM public.lead_touches WHERE lead_id = v_lead AND next_follow_up_at IS NOT NULL) AS next_fu
    FROM public.lead_touches WHERE lead_id = v_lead
  ) s
  WHERE l.id = v_lead;
  RETURN NULL;
END; $$;

CREATE TRIGGER lead_touches_sync_summary AFTER INSERT OR UPDATE OR DELETE ON public.lead_touches
  FOR EACH ROW EXECUTE FUNCTION public.sync_lead_touch_summary();