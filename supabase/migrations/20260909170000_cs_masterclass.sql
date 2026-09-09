-- CS: masterclasses (participações, uso em projeto real, marcos de sucesso)
-- e causa do diagnóstico do vermelho. Catálogo e regras em cs_settings.masterclass.

ALTER TABLE public.cs_clients
  ADD COLUMN IF NOT EXISTS diagnostico_causa text
    CHECK (diagnostico_causa IS NULL OR diagnostico_causa IN ('analista_novo', 'falta_projeto', 'nao_ve_valor', 'outro')),
  ADD COLUMN IF NOT EXISTS primeiro_sucesso_at date,
  ADD COLUMN IF NOT EXISTS segundo_sucesso_at date;

CREATE TABLE IF NOT EXISTS public.cs_masterclass_participations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uid text NOT NULL REFERENCES public.cs_clients(client_uid) ON DELETE CASCADE,
  module_id integer NOT NULL CHECK (module_id BETWEEN 1 AND 20),
  held_at date NOT NULL DEFAULT CURRENT_DATE,
  contact_id uuid REFERENCES public.cs_contacts(id) ON DELETE SET NULL,
  participantes text,
  analista_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Comprovação: o cliente usou o módulo em projeto real (conta para o marco)
  used_in_project boolean NOT NULL DEFAULT false,
  used_at date,
  used_note text,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cs_mc_client ON public.cs_masterclass_participations(client_uid, held_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cs_masterclass_participations TO authenticated;
GRANT ALL ON public.cs_masterclass_participations TO service_role;
ALTER TABLE public.cs_masterclass_participations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cs_mc_all" ON public.cs_masterclass_participations;
CREATE POLICY "cs_mc_all" ON public.cs_masterclass_participations FOR ALL TO authenticated
  USING (public.cs_can_see_client(client_uid)) WITH CHECK (public.cs_can_see_client(client_uid));
DROP TRIGGER IF EXISTS cs_mc_touch ON public.cs_masterclass_participations;
CREATE TRIGGER cs_mc_touch BEFORE UPDATE ON public.cs_masterclass_participations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
