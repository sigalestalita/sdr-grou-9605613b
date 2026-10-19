CREATE OR REPLACE FUNCTION public.etapa_encerra_cadencia(_stage uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.stages WHERE id = _stage AND slug IN ('agendado', 'desqualificado')
  )
$$;

CREATE OR REPLACE FUNCTION public.leads_encerra_cadencia()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.etapa_encerra_cadencia(NEW.stage_id) THEN
    NEW.cadence_status := 'encerrada';
    NEW.next_follow_up_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.leads_encerra_cadencia_tarefas()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.etapa_encerra_cadencia(NEW.stage_id) THEN
    UPDATE public.whatsapp_fup_enrollments
       SET status = 'stopped_stage', completed_at = now(), next_run_at = NULL
     WHERE lead_id = NEW.id AND status = 'active';
    UPDATE public.lead_touches
       SET next_follow_up_at = NULL
     WHERE lead_id = NEW.id AND next_follow_up_at IS NOT NULL AND follow_up_done_at IS NULL;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.leads_encerra_cadencia() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.leads_encerra_cadencia_tarefas() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS leads_encerra_cadencia ON public.leads;
CREATE TRIGGER leads_encerra_cadencia
  BEFORE INSERT OR UPDATE OF stage_id ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_encerra_cadencia();

DROP TRIGGER IF EXISTS leads_encerra_cadencia_tarefas ON public.leads;
CREATE TRIGGER leads_encerra_cadencia_tarefas
  AFTER UPDATE OF stage_id ON public.leads
  FOR EACH ROW WHEN (OLD.stage_id IS DISTINCT FROM NEW.stage_id)
  EXECUTE FUNCTION public.leads_encerra_cadencia_tarefas();