ALTER TABLE public.cs_clients
  ADD COLUMN IF NOT EXISTS rd_org_id text,
  ADD COLUMN IF NOT EXISTS rd_lifecycle text,
  ADD COLUMN IF NOT EXISTS rd_owner text,
  ADD COLUMN IF NOT EXISTS rd_synced_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS cs_clients_rd_org_id_key
  ON public.cs_clients (rd_org_id) WHERE rd_org_id IS NOT NULL;