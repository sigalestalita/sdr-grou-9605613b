-- Ligar os leads antigos a contato/empresa é trabalho de uma vez só: os leads
-- novos são ligados pelo gatilho na hora em que são salvos. Em vez de um
-- agendamento a cada 2 minutos (720 execuções/dia), o cron roda de hora em
-- hora em lotes de até 5.000 (~70 mil leads em ~14 h) e se desliga sozinho
-- quando não há mais lead pendente.
CREATE OR REPLACE FUNCTION public.vincular_leads_pendentes(_limite integer DEFAULT 1000)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r record; n integer := 0; tentados integer := 0;
BEGIN
  FOR r IN SELECT id FROM public.leads WHERE contact_id IS NULL
            ORDER BY created_at DESC LIMIT LEAST(GREATEST(_limite, 1), 5000) LOOP
    tentados := tentados + 1;
    BEGIN
      PERFORM public.vincular_lead(r.id);
      n := n + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'vincular_lead(%): %', r.id, SQLERRM;
    END;
  END LOOP;
  -- Nada pendente: o backfill acabou, desliga o agendamento.
  IF tentados = 0 THEN
    BEGIN
      PERFORM cron.unschedule('vincular-leads');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
  RETURN n;
END;
$$;
