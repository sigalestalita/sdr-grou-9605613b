-- Leads importados do RD ficam fora do módulo SDR (Pipeline, agenda, cadência,
-- campanhas, automações) até a migração terminar. Nada é apagado: a coluna
-- oculto_sdr esconde as linhas da sessão dos usuários (RLS); o serviço (chave
-- de serviço, usada pela migração) continua vendo tudo.
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS oculto_sdr boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS leads_oculto_sdr_idx ON public.leads (oculto_sdr) WHERE oculto_sdr;

-- Lead veio do RD (tem negócio do RD) e não nasceu no Compass: sem formulário,
-- sem origem de planilha/WhatsApp/manual.
CREATE OR REPLACE FUNCTION public.lead_is_rd_import(l public.leads)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT l.rd_deal_id IS NOT NULL
     AND l.form_payload IS NULL
     AND l.form_name IS NULL
     AND COALESCE(l.source, '') NOT IN ('manual', 'meta_ads', 'organico_outbound', 'whatsapp_inbox', 'whatsapp_manual_assume', 'whatsapp_ai_test');
$$;

-- Retroativo: o que já entrou do RD
UPDATE public.leads SET oculto_sdr = true WHERE NOT oculto_sdr AND public.lead_is_rd_import(leads);

-- Daqui em diante: a sincronização do RD (cron e botão) cria já oculto
CREATE OR REPLACE FUNCTION public.leads_hide_rd_import()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF public.lead_is_rd_import(NEW) THEN NEW.oculto_sdr := true; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS leads_hide_rd_import ON public.leads;
CREATE TRIGGER leads_hide_rd_import BEFORE INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_hide_rd_import();

-- Sessão dos usuários só enxerga o que não está oculto; inserir continua livre.
DROP POLICY IF EXISTS "leads_auth_all" ON public.leads;
DROP POLICY IF EXISTS "leads_auth_visiveis" ON public.leads;
CREATE POLICY "leads_auth_visiveis" ON public.leads FOR ALL TO authenticated
  USING (NOT oculto_sdr) WITH CHECK (true);
