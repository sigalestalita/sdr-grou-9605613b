-- A conversão continua imutável, mas apagar o lead ou o contato (ON DELETE SET NULL)
-- precisa conseguir soltar o vínculo.
CREATE OR REPLACE FUNCTION public.mkt_conversoes_imutavel()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (to_jsonb(NEW) - 'lead_id' - 'contact_id' - 'acao')
     IS DISTINCT FROM (to_jsonb(OLD) - 'lead_id' - 'contact_id' - 'acao') THEN
    RAISE EXCEPTION 'mkt_conversoes não pode ser alterada';
  END IF;
  IF OLD.lead_id IS NOT NULL AND NEW.lead_id IS NOT NULL AND NEW.lead_id <> OLD.lead_id THEN
    RAISE EXCEPTION 'mkt_conversoes: lead_id já definido';
  END IF;
  IF OLD.contact_id IS NOT NULL AND NEW.contact_id IS NOT NULL AND NEW.contact_id <> OLD.contact_id THEN
    RAISE EXCEPTION 'mkt_conversoes: contact_id já definido';
  END IF;
  RETURN NEW;
END;
$$;
