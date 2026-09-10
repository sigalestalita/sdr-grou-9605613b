ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS oculto_sdr boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS leads_oculto_sdr_idx ON public.leads (oculto_sdr) WHERE oculto_sdr;

CREATE OR REPLACE FUNCTION public.lead_is_rd_import(l public.leads)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT l.rd_deal_id IS NOT NULL
     AND l.form_payload IS NULL
     AND l.form_name IS NULL
     AND COALESCE(l.source, '') NOT IN ('manual', 'meta_ads', 'organico_outbound', 'whatsapp_inbox', 'whatsapp_manual_assume', 'whatsapp_ai_test');
$$;

UPDATE public.leads SET oculto_sdr = true WHERE NOT oculto_sdr AND public.lead_is_rd_import(leads);

CREATE OR REPLACE FUNCTION public.leads_hide_rd_import()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF public.lead_is_rd_import(NEW) THEN NEW.oculto_sdr := true; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS leads_hide_rd_import ON public.leads;
CREATE TRIGGER leads_hide_rd_import BEFORE INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_hide_rd_import();

DROP POLICY IF EXISTS "leads_auth_all" ON public.leads;
DROP POLICY IF EXISTS "leads_auth_visiveis" ON public.leads;
CREATE POLICY "leads_auth_visiveis" ON public.leads FOR ALL TO authenticated
  USING (NOT oculto_sdr) WITH CHECK (true);

REVOKE ALL ON FUNCTION public.lead_is_rd_import(public.leads) FROM anon, public;
REVOKE ALL ON FUNCTION public.leads_hide_rd_import() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.lead_is_rd_import(public.leads) TO authenticated, service_role;