ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS oculto_sdr boolean NOT NULL DEFAULT false;
ALTER TABLE public.cs_clients ADD COLUMN IF NOT EXISTS porte text;
ALTER TABLE public.cs_clients ADD COLUMN IF NOT EXISTS num_funcionarios integer;
CREATE INDEX IF NOT EXISTS leads_oculto_sdr_idx ON public.leads (oculto_sdr) WHERE oculto_sdr = false;