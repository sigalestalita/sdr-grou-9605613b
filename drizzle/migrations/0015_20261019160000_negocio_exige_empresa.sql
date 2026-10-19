-- Negócio sempre com empresa: depois do backfill (20261019150000), que deu
-- empresa aos negócios antigos que não tinham.
ALTER TABLE public.deals ALTER COLUMN company_id SET NOT NULL;
-- Apagar a empresa não pode deixar negócio órfão (antes era SET NULL).
ALTER TABLE public.deals DROP CONSTRAINT IF EXISTS deals_company_id_fkey;
ALTER TABLE public.deals ADD CONSTRAINT deals_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;
