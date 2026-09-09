-- Onda 1 · CS — tipo de serviço, tag de uso, analista PDA, delegação de
-- carteira, RLS por carteira e novos padrões do health score.
-- Depende de 20260908220000_cs_onda1_enums.sql.

-- =========================================================
-- cs_clients: campos estruturados do playbook v2
-- =========================================================
ALTER TABLE public.cs_clients
  ADD COLUMN IF NOT EXISTS tipo_servico text
    CHECK (tipo_servico IN ('licenca_pda', 'certificacao', 'dg', 'avulso', 'consultoria')),
  ADD COLUMN IF NOT EXISTS tag_uso text
    CHECK (tag_uso IN ('recrutamento', 'desenvolvimento', 'ambos')),
  ADD COLUMN IF NOT EXISTS produtos_ativos text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.cs_clients.tipo_servico IS
  'Serviço principal contratado. Sem licença PDA não há sinaleira e o health score é renormalizado sobre os critérios aplicáveis.';
COMMENT ON COLUMN public.cs_clients.tag_uso IS
  'Playbook v2: para que o cliente usa o PDA. Filtra Masterclasses e jornadas por marco.';

-- Quem tem login PDA é, por definição, cliente de licença; consultoria segue o tipo.
UPDATE public.cs_clients SET tipo_servico = 'licenca_pda'
 WHERE tipo_servico IS NULL AND login_pda IS NOT NULL AND length(trim(login_pda)) > 0;
UPDATE public.cs_clients SET tipo_servico = 'consultoria'
 WHERE tipo_servico IS NULL AND tipo_lead = 'consultoria';

-- =========================================================
-- cs_contacts: analista PDA certificado (critério do health score)
-- =========================================================
ALTER TABLE public.cs_contacts
  ADD COLUMN IF NOT EXISTS analista_pda boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS analista_certificado_em date;
CREATE INDEX IF NOT EXISTS cs_contacts_analista_idx
  ON public.cs_contacts (client_uid) WHERE analista_pda;

-- =========================================================
-- cs_delegations: cobertura de carteira (férias, afastamento)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.cs_delegations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  starts_at date NOT NULL DEFAULT CURRENT_DATE,
  ends_at date,
  reason text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_user_id <> to_user_id),
  CHECK (ends_at IS NULL OR ends_at >= starts_at)
);
CREATE INDEX IF NOT EXISTS cs_delegations_to_idx
  ON public.cs_delegations (to_user_id, starts_at, ends_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cs_delegations TO authenticated;
GRANT ALL ON public.cs_delegations TO service_role;
ALTER TABLE public.cs_delegations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cs_delegations_select" ON public.cs_delegations;
CREATE POLICY "cs_delegations_select" ON public.cs_delegations FOR SELECT TO authenticated
  USING (public.is_manager(auth.uid()) OR from_user_id = auth.uid() OR to_user_id = auth.uid());
DROP POLICY IF EXISTS "cs_delegations_write" ON public.cs_delegations;
CREATE POLICY "cs_delegations_write" ON public.cs_delegations FOR ALL TO authenticated
  USING (public.is_manager(auth.uid()) OR from_user_id = auth.uid())
  WITH CHECK (public.is_manager(auth.uid()) OR from_user_id = auth.uid());

-- =========================================================
-- Quem enxerga um cliente
-- Gestão vê tudo. Analista vê a própria carteira (como CS ou como executivo),
-- o que lhe foi delegado no período, e — se for do time de CS — clientes ainda
-- sem responsável, para poder assumi-los. SECURITY DEFINER evita recursão
-- de RLS ao consultar cs_clients de dentro das políticas.
-- =========================================================
CREATE OR REPLACE FUNCTION public.cs_can_see_client(_client_uid text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_manager(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.cs_clients c
      WHERE c.client_uid = _client_uid
        AND (
          c.cs_responsavel_id = auth.uid()
          OR c.comercial_responsavel_id = auth.uid()
          OR (c.cs_responsavel_id IS NULL AND public.has_team(auth.uid(), 'cs'))
          OR EXISTS (
            SELECT 1 FROM public.cs_delegations d
            WHERE d.to_user_id = auth.uid()
              AND d.from_user_id IN (c.cs_responsavel_id, c.comercial_responsavel_id)
              AND d.starts_at <= CURRENT_DATE
              AND (d.ends_at IS NULL OR d.ends_at >= CURRENT_DATE)
          )
        )
    )
$$;

-- ---- cs_clients
DROP POLICY IF EXISTS "cs_clients_select" ON public.cs_clients;
DROP POLICY IF EXISTS "cs_clients_insert" ON public.cs_clients;
DROP POLICY IF EXISTS "cs_clients_update" ON public.cs_clients;
CREATE POLICY "cs_clients_select" ON public.cs_clients FOR SELECT TO authenticated
  USING (public.cs_can_see_client(client_uid));
CREATE POLICY "cs_clients_insert" ON public.cs_clients FOR INSERT TO authenticated
  WITH CHECK (public.can_access_module(auth.uid(), 'cs'));
CREATE POLICY "cs_clients_update" ON public.cs_clients FOR UPDATE TO authenticated
  USING (public.cs_can_see_client(client_uid))
  WITH CHECK (public.cs_can_see_client(client_uid));

-- ---- tabelas filhas: mesma regra da empresa
DROP POLICY IF EXISTS "cs_contacts_all" ON public.cs_contacts;
CREATE POLICY "cs_contacts_all" ON public.cs_contacts FOR ALL TO authenticated
  USING (public.cs_can_see_client(client_uid)) WITH CHECK (public.cs_can_see_client(client_uid));

DROP POLICY IF EXISTS "cs_client_tags_all" ON public.cs_client_tags;
CREATE POLICY "cs_client_tags_all" ON public.cs_client_tags FOR ALL TO authenticated
  USING (public.cs_can_see_client(client_uid)) WITH CHECK (public.cs_can_see_client(client_uid));

DROP POLICY IF EXISTS "cs_records_all" ON public.cs_records;
CREATE POLICY "cs_records_all" ON public.cs_records FOR ALL TO authenticated
  USING (public.cs_can_see_client(client_uid)) WITH CHECK (public.cs_can_see_client(client_uid));

DROP POLICY IF EXISTS "cs_timeline_all" ON public.cs_timeline_events;
CREATE POLICY "cs_timeline_all" ON public.cs_timeline_events FOR ALL TO authenticated
  USING (public.cs_can_see_client(client_uid)) WITH CHECK (public.cs_can_see_client(client_uid));

DROP POLICY IF EXISTS "cs_alerts_all" ON public.cs_alerts;
CREATE POLICY "cs_alerts_all" ON public.cs_alerts FOR ALL TO authenticated
  USING (public.cs_can_see_client(client_uid)) WITH CHECK (public.cs_can_see_client(client_uid));

DROP POLICY IF EXISTS "Autenticados gerenciam tarefas de cadencia" ON public.cs_cadence_tasks;
CREATE POLICY "cs_cadence_tasks_all" ON public.cs_cadence_tasks FOR ALL TO authenticated
  USING (public.cs_can_see_client(client_uid)) WITH CHECK (public.cs_can_see_client(client_uid));

DROP POLICY IF EXISTS "CS pode gerenciar reunioes" ON public.cs_meetings;
CREATE POLICY "cs_meetings_all" ON public.cs_meetings FOR ALL TO authenticated
  USING (public.cs_can_see_client(client_uid)) WITH CHECK (public.cs_can_see_client(client_uid));

DROP POLICY IF EXISTS "CS module can manage sales" ON public.cs_sales;
CREATE POLICY "cs_sales_all" ON public.cs_sales FOR ALL TO authenticated
  USING (public.cs_can_see_client(client_uid)) WITH CHECK (public.cs_can_see_client(client_uid));

DROP POLICY IF EXISTS "cs_signal_snapshots_select" ON public.cs_signal_snapshots;
CREATE POLICY "cs_signal_snapshots_select" ON public.cs_signal_snapshots FOR SELECT TO authenticated
  USING (public.cs_can_see_client(client_uid));

DROP POLICY IF EXISTS "cs emails read" ON public.cs_emails;
CREATE POLICY "cs_emails_read" ON public.cs_emails FOR SELECT TO authenticated
  USING (client_uid IS NULL AND public.can_access_module(auth.uid(), 'cs')
         OR client_uid IS NOT NULL AND public.cs_can_see_client(client_uid));

-- =========================================================
-- Health score: pesos novos, pontos por cor e opções
-- =========================================================
UPDATE public.cs_settings
   SET value = jsonb_build_object(
         'sinaleira', 40, 'agenda', 10, 'whatsapp', 10,
         'proposta_aberta', 10, 'masterclass', 10, 'analista_pda', 10),
       updated_at = now()
 WHERE key = 'health_weights';

INSERT INTO public.cs_settings (key, value) VALUES
  ('health_signal_points', '{"verde": 40, "amarelo": 20, "vermelho": 0}'),
  ('health_options', '{"renormalizar_sem_sinaleira": true}'),
  ('daily_contact_target', '{"contatos_por_dia": 5}')
ON CONFLICT (key) DO NOTHING;
