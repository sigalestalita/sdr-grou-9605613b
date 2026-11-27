-- Empresas, contatos e negócios existem para todos os times. O que muda por
-- time é o que cada um pode fazer na ficha, não o que pode ver.

-- 1) Quem é do time (qualquer módulo) ou gestão lê as fichas do CS.
CREATE OR REPLACE FUNCTION public.pode_ver_empresas(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _user_id IS NOT NULL AND (
    public.is_manager(_user_id)
    OR EXISTS (SELECT 1 FROM public.user_teams ut WHERE ut.user_id = _user_id)
    OR public.has_role(_user_id, 'executivo')
  )
$$;
REVOKE ALL ON FUNCTION public.pode_ver_empresas(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pode_ver_empresas(uuid) TO authenticated, service_role;

-- Políticas de leitura somadas às que já existem (as de escrita continuam
-- pela carteira: responsável, delegação ou gestão).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cs_clients','cs_signal_snapshots','cs_emails','cs_alerts','cs_cadence_tasks',
    'cs_client_tags','cs_contacts','cs_feature_offers','cs_journey_emails','cs_masterclass_participations',
    'cs_meetings','cs_records','cs_reuniao_ofertas','cs_sales','cs_tasks','cs_timeline_events']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_leitura_todos', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.pode_ver_empresas(auth.uid()))',
      t || '_leitura_todos', t);
  END LOOP;
END $$;

-- 2) Empresas da base que não têm ficha do CS (as que têm aparecem pela ficha).
CREATE OR REPLACE FUNCTION public.empresas_da_base()
RETURNS TABLE (
  id uuid, nome text, cnpj text, segmento text, cidade text, estado text,
  owner_user_id uuid, sdr_user_id uuid, negocios_abertos integer, negocios_ganhos integer,
  ultimo_negocio timestamptz, contatos integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.id, c.nome, c.cnpj, c.segmento, c.cidade, c.estado, c.owner_user_id, c.sdr_user_id,
    (SELECT count(*)::int FROM deals d WHERE d.company_id = c.id AND d.status = 'open'),
    (SELECT count(*)::int FROM deals d WHERE d.company_id = c.id AND d.status = 'won'),
    (SELECT max(d.created_at) FROM deals d WHERE d.company_id = c.id),
    (SELECT count(*)::int FROM contacts k WHERE k.company_id = c.id)
  FROM companies c
  WHERE public.pode_ver_empresas(auth.uid())
    AND NOT EXISTS (SELECT 1 FROM cs_clients x WHERE x.company_id = c.id AND x.mesclado_em IS NULL)
  ORDER BY c.nome
$$;
REVOKE ALL ON FUNCTION public.empresas_da_base() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.empresas_da_base() TO authenticated, service_role;

-- 3) Visões salvas de cada pessoa, por lista (empresas, contatos…).
CREATE TABLE IF NOT EXISTS public.visoes_salvas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  objeto text NOT NULL,
  nome text NOT NULL CHECK (length(trim(nome)) BETWEEN 1 AND 60),
  filtros jsonb NOT NULL DEFAULT '{}'::jsonb,
  ordem integer NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS visoes_salvas_user_objeto ON public.visoes_salvas (user_id, objeto, ordem);
ALTER TABLE public.visoes_salvas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS visoes_salvas_dono ON public.visoes_salvas;
CREATE POLICY visoes_salvas_dono ON public.visoes_salvas FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visoes_salvas TO authenticated;

NOTIFY pgrst, 'reload schema';
