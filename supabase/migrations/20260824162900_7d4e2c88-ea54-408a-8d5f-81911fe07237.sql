CREATE OR REPLACE FUNCTION public.cs_stage_from_contract(_start date, _renewal date DEFAULT NULL)
RETURNS public.cs_journey_stage
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH b AS (
    SELECT COALESCE(_start, (_renewal - INTERVAL '12 months')::date) AS ini
  )
  SELECT CASE
    WHEN (SELECT ini FROM b) IS NULL THEN NULL
    WHEN (CURRENT_DATE - (SELECT ini FROM b)) < 61 THEN 'onboarding'::public.cs_journey_stage
    WHEN (CURRENT_DATE - (SELECT ini FROM b)) < 305 THEN 'ativacao'::public.cs_journey_stage
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
  v_stage := public.cs_stage_from_contract(NEW.data_inicio_contrato, NEW.data_renovacao);
  IF v_stage IS NOT NULL AND (NEW.journey_stage IS DISTINCT FROM v_stage) THEN
    NEW.journey_stage := v_stage;
    NEW.stage_entered_at := now();
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS cs_clients_stage_from_contract ON public.cs_clients;
CREATE TRIGGER cs_clients_stage_from_contract
BEFORE INSERT OR UPDATE OF data_inicio_contrato, data_renovacao ON public.cs_clients
FOR EACH ROW EXECUTE FUNCTION public.cs_apply_stage_from_contract();

UPDATE public.cs_clients c
SET journey_stage = public.cs_stage_from_contract(c.data_inicio_contrato, c.data_renovacao),
    stage_entered_at = now()
WHERE public.cs_stage_from_contract(c.data_inicio_contrato, c.data_renovacao) IS NOT NULL
  AND c.journey_stage IS DISTINCT FROM public.cs_stage_from_contract(c.data_inicio_contrato, c.data_renovacao);