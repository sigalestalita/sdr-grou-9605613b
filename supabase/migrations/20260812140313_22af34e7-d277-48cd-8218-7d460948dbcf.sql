ALTER TABLE public.lead_touches
  ADD COLUMN IF NOT EXISTS follow_up_done_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS follow_up_done_by uuid REFERENCES auth.users(id);

CREATE OR REPLACE FUNCTION public.sync_lead_touch_summary()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      (SELECT MIN(next_follow_up_at) FROM public.lead_touches
        WHERE lead_id = v_lead AND next_follow_up_at IS NOT NULL AND follow_up_done_at IS NULL) AS next_fu
    FROM public.lead_touches WHERE lead_id = v_lead
  ) s
  WHERE l.id = v_lead;
  RETURN NULL;
END; $function$;

UPDATE public.leads l SET next_follow_up_at = (
  SELECT MIN(t.next_follow_up_at) FROM public.lead_touches t
  WHERE t.lead_id = l.id AND t.next_follow_up_at IS NOT NULL AND t.follow_up_done_at IS NULL
) WHERE l.next_follow_up_at IS NOT NULL;