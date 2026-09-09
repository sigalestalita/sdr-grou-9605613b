-- CS: funcionalidades da plataforma (Bloco 12) — ofertas registradas por
-- empresa e o volume de pessoas mapeadas (critério de Tendências de Grupo).
ALTER TABLE public.cs_clients ADD COLUMN IF NOT EXISTS pessoas_mapeadas integer;

CREATE TABLE IF NOT EXISTS public.cs_feature_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uid text NOT NULL REFERENCES public.cs_clients(client_uid) ON DELETE CASCADE,
  feature_id text NOT NULL,
  status text NOT NULL DEFAULT 'oferecida' CHECK (status IN ('oferecida', 'adotada', 'recusada')),
  offered_at date NOT NULL DEFAULT CURRENT_DATE,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cs_feature_offers_client ON public.cs_feature_offers(client_uid, offered_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cs_feature_offers TO authenticated;
GRANT ALL ON public.cs_feature_offers TO service_role;
ALTER TABLE public.cs_feature_offers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cs_feature_offers_all" ON public.cs_feature_offers;
CREATE POLICY "cs_feature_offers_all" ON public.cs_feature_offers FOR ALL TO authenticated
  USING (public.cs_can_see_client(client_uid)) WITH CHECK (public.cs_can_see_client(client_uid));
DROP TRIGGER IF EXISTS cs_feature_offers_touch ON public.cs_feature_offers;
CREATE TRIGGER cs_feature_offers_touch BEFORE UPDATE ON public.cs_feature_offers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
