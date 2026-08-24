CREATE OR REPLACE FUNCTION public.cs_stage_from_contract(_start date)
RETURNS public.cs_journey_stage
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _start IS NULL THEN NULL
    WHEN (CURRENT_DATE - _start) < 61 THEN 'onboarding'::public.cs_journey_stage
    WHEN (CURRENT_DATE - _start) < 305 THEN 'ativacao'::public.cs_journey_stage
    ELSE 'renovacao'::public.cs_journey_stage
  END
$$;

CREATE OR REPLACE FUNCTION public.cs_apply_stage_from_contract()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_stage public.cs_journey_stage;
BEGIN
  v_stage := public.cs_stage_from_contract(NEW.data_inicio_contrato);
  IF v_stage IS NOT NULL AND (NEW.journey_stage IS DISTINCT FROM v_stage) THEN
    NEW.journey_stage := v_stage;
    NEW.stage_entered_at := now();
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS cs_clients_stage_from_contract ON public.cs_clients;
CREATE TRIGGER cs_clients_stage_from_contract
BEFORE INSERT OR UPDATE OF data_inicio_contrato ON public.cs_clients
FOR EACH ROW EXECUTE FUNCTION public.cs_apply_stage_from_contract();

UPDATE public.cs_clients c
SET journey_stage = public.cs_stage_from_contract(c.data_inicio_contrato),
    stage_entered_at = now()
WHERE c.data_inicio_contrato IS NOT NULL
  AND c.journey_stage IS DISTINCT FROM public.cs_stage_from_contract(c.data_inicio_contrato);