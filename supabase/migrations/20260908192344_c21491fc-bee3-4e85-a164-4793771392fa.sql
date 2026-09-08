CREATE TABLE public.rd_organizations (
  rd_id text PRIMARY KEY,
  name text NOT NULL,
  lifecycle text,
  cnpj text,
  site_url text,
  segment text,
  owner_name text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.rd_organizations TO authenticated;
GRANT ALL ON public.rd_organizations TO service_role;
ALTER TABLE public.rd_organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rd_orgs_read" ON public.rd_organizations FOR SELECT TO authenticated USING (true);
CREATE TRIGGER rd_organizations_touch BEFORE UPDATE ON public.rd_organizations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.rd_contacts (
  rd_id text PRIMARY KEY,
  name text NOT NULL,
  email text,
  phone text,
  position text,
  linkedin_url text,
  rd_org_id text,
  rd_org_name text,
  owner_name text,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.rd_contacts TO authenticated;
GRANT ALL ON public.rd_contacts TO service_role;
ALTER TABLE public.rd_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rd_contacts_read" ON public.rd_contacts FOR SELECT TO authenticated USING (true);
CREATE INDEX rd_contacts_org_idx ON public.rd_contacts (rd_org_id);
CREATE INDEX rd_contacts_email_idx ON public.rd_contacts (lower(email));
CREATE TRIGGER rd_contacts_touch BEFORE UPDATE ON public.rd_contacts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.rd_deals (
  rd_id text PRIMARY KEY,
  name text NOT NULL,
  pipeline text,
  stage text,
  amount numeric,
  status text,
  rd_org_id text,
  rd_org_name text,
  rd_contact_id text,
  owner_name text,
  source_name text,
  campaign_name text,
  rd_created_at timestamptz,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.rd_deals TO authenticated;
GRANT ALL ON public.rd_deals TO service_role;
ALTER TABLE public.rd_deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rd_deals_read" ON public.rd_deals FOR SELECT TO authenticated USING (true);
CREATE INDEX rd_deals_org_idx ON public.rd_deals (rd_org_id);
CREATE INDEX rd_deals_pipeline_idx ON public.rd_deals (pipeline);
CREATE TRIGGER rd_deals_touch BEFORE UPDATE ON public.rd_deals FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.cs_contacts ADD COLUMN IF NOT EXISTS rd_contact_id text;
CREATE UNIQUE INDEX IF NOT EXISTS cs_contacts_rd_contact_id_key ON public.cs_contacts (rd_contact_id) WHERE rd_contact_id IS NOT NULL;

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS rd_org_id text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS rd_pipeline text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS rd_contact_id text;
CREATE INDEX IF NOT EXISTS leads_rd_org_idx ON public.leads (rd_org_id);