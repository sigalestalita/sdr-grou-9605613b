-- ============ ENUMS ============
CREATE TYPE public.cs_client_type AS ENUM ('empresa', 'consultoria');
CREATE TYPE public.cs_origin AS ENUM ('marketing', 'indicacao', 'outbound', 'renovacao');
CREATE TYPE public.cs_journey_stage AS ENUM ('onboarding', 'ativacao', 'renovacao');
CREATE TYPE public.cs_signal AS ENUM ('verde', 'amarelo', 'vermelho', 'sem_dado');
CREATE TYPE public.cs_contact_origin AS ENUM ('manual', 'email_bcc', 'pda_api', 'linkedin');

-- ============ UID GENERATOR ============
CREATE OR REPLACE FUNCTION public.cs_gen_client_uid()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  i int;
BEGIN
  LOOP
    candidate := '';
    FOR i IN 1..4 LOOP
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.cs_clients WHERE client_uid = candidate);
  END LOOP;
  RETURN candidate;
END; $$;

-- ============ CLIENTS ============
CREATE TABLE public.cs_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uid text NOT NULL UNIQUE,
  nome_empresa text NOT NULL,
  cnpj text,
  parent_client_uid text,
  tipo_lead public.cs_client_type NOT NULL DEFAULT 'empresa',
  origem public.cs_origin NOT NULL DEFAULT 'marketing',
  aporte_valor numeric NOT NULL DEFAULT 0,
  cs_responsavel_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  comercial_responsavel_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  data_inicio_contrato date,
  data_renovacao date,
  login_pda text,
  linkedin_url text,
  site_url text,
  setor text,
  dg_ativo boolean NOT NULL DEFAULT false,
  journey_stage public.cs_journey_stage NOT NULL DEFAULT 'onboarding',
  stage_entered_at timestamptz NOT NULL DEFAULT now(),
  last_contact_at timestamptz,
  health_score integer NOT NULL DEFAULT 0,
  current_signal public.cs_signal NOT NULL DEFAULT 'sem_dado',
  pda_consumo_pct numeric,
  ativo boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cs_clients_parent_idx ON public.cs_clients (parent_client_uid);
CREATE INDEX cs_clients_stage_idx ON public.cs_clients (journey_stage);
CREATE INDEX cs_clients_cs_resp_idx ON public.cs_clients (cs_responsavel_id);

CREATE OR REPLACE FUNCTION public.cs_set_client_uid()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.client_uid IS NULL OR length(trim(NEW.client_uid)) = 0 THEN
    NEW.client_uid := public.cs_gen_client_uid();
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER cs_clients_set_uid BEFORE INSERT ON public.cs_clients
FOR EACH ROW EXECUTE FUNCTION public.cs_set_client_uid();

CREATE OR REPLACE FUNCTION public.cs_protect_client_uid()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.client_uid := OLD.client_uid;
  RETURN NEW;
END; $$;

CREATE TRIGGER cs_clients_protect_uid BEFORE UPDATE ON public.cs_clients
FOR EACH ROW EXECUTE FUNCTION public.cs_protect_client_uid();

CREATE TRIGGER cs_clients_touch BEFORE UPDATE ON public.cs_clients
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cs_clients TO authenticated;
GRANT ALL ON public.cs_clients TO service_role;
ALTER TABLE public.cs_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cs_clients_select" ON public.cs_clients FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "cs_clients_insert" ON public.cs_clients FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "cs_clients_update" ON public.cs_clients FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "cs_clients_delete" ON public.cs_clients FOR DELETE TO authenticated USING (public.is_manager(auth.uid()));

-- ============ CONTACTS ============
CREATE TABLE public.cs_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uid text NOT NULL REFERENCES public.cs_clients(client_uid) ON DELETE CASCADE,
  nome text NOT NULL,
  email text,
  whatsapp text,
  cargo text,
  modulos_vinculados text[] NOT NULL DEFAULT '{}',
  origem_detecao public.cs_contact_origin NOT NULL DEFAULT 'manual',
  ativo_no_cliente boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cs_contacts_client_idx ON public.cs_contacts (client_uid);
CREATE TRIGGER cs_contacts_touch BEFORE UPDATE ON public.cs_contacts
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cs_contacts TO authenticated;
GRANT ALL ON public.cs_contacts TO service_role;
ALTER TABLE public.cs_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cs_contacts_all" ON public.cs_contacts FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ============ TAGS ============
CREATE TABLE public.cs_client_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uid text NOT NULL REFERENCES public.cs_clients(client_uid) ON DELETE CASCADE,
  tag text NOT NULL,
  origem_agenda_id uuid,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  data_criacao timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cs_client_tags_client_idx ON public.cs_client_tags (client_uid);
CREATE INDEX cs_client_tags_tag_idx ON public.cs_client_tags (tag);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cs_client_tags TO authenticated;
GRANT ALL ON public.cs_client_tags TO service_role;
ALTER TABLE public.cs_client_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cs_client_tags_all" ON public.cs_client_tags FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ============ WEEKLY SIGNAL SNAPSHOTS ============
CREATE TABLE public.cs_signal_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uid text NOT NULL REFERENCES public.cs_clients(client_uid) ON DELETE CASCADE,
  week_start date NOT NULL,
  signal public.cs_signal NOT NULL DEFAULT 'sem_dado',
  consumo_pct numeric,
  health_score integer,
  source text NOT NULL DEFAULT 'planilha',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_uid, week_start)
);
CREATE INDEX cs_signal_snapshots_week_idx ON public.cs_signal_snapshots (week_start DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cs_signal_snapshots TO authenticated;
GRANT ALL ON public.cs_signal_snapshots TO service_role;
ALTER TABLE public.cs_signal_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cs_signal_snapshots_select" ON public.cs_signal_snapshots FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "cs_signal_snapshots_write" ON public.cs_signal_snapshots FOR ALL TO authenticated
  USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

-- ============ RECORDS (notas) ============
CREATE TABLE public.cs_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uid text NOT NULL REFERENCES public.cs_clients(client_uid) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  tipo text NOT NULL DEFAULT 'nota',
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cs_records_client_idx ON public.cs_records (client_uid, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cs_records TO authenticated;
GRANT ALL ON public.cs_records TO service_role;
ALTER TABLE public.cs_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cs_records_all" ON public.cs_records FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ============ TIMELINE ============
CREATE TABLE public.cs_timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uid text NOT NULL REFERENCES public.cs_clients(client_uid) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  channel text,
  title text NOT NULL,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cs_timeline_client_idx ON public.cs_timeline_events (client_uid, occurred_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cs_timeline_events TO authenticated;
GRANT ALL ON public.cs_timeline_events TO service_role;
ALTER TABLE public.cs_timeline_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cs_timeline_all" ON public.cs_timeline_events FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ============ ALERTS ============
CREATE TABLE public.cs_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uid text NOT NULL REFERENCES public.cs_clients(client_uid) ON DELETE CASCADE,
  alert_type text NOT NULL,
  reason text NOT NULL,
  severity text NOT NULL DEFAULT 'media',
  status text NOT NULL DEFAULT 'open',
  contact_type text,
  whatsapp_answered boolean,
  agenda_type text,
  observation text,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  follow_up_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cs_alerts_client_idx ON public.cs_alerts (client_uid);
CREATE INDEX cs_alerts_status_idx ON public.cs_alerts (status);
CREATE TRIGGER cs_alerts_touch BEFORE UPDATE ON public.cs_alerts
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cs_alerts TO authenticated;
GRANT ALL ON public.cs_alerts TO service_role;
ALTER TABLE public.cs_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cs_alerts_all" ON public.cs_alerts FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- ============ SETTINGS ============
CREATE TABLE public.cs_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.cs_settings TO authenticated;
GRANT ALL ON public.cs_settings TO service_role;
ALTER TABLE public.cs_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cs_settings_select" ON public.cs_settings FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "cs_settings_write" ON public.cs_settings FOR ALL TO authenticated
  USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

INSERT INTO public.cs_settings (key, value) VALUES
  ('health_weights', '{"sinaleira_pda":50,"agenda_90d":25,"whatsapp_respondido":10,"email_respondido":5,"uso_plataforma_cs":10}'::jsonb),
  ('stage_sla_days', '{"onboarding":60,"ativacao":240,"renovacao":60,"sem_contato_dias":45}'::jsonb),
  ('routing', '{"aporte_threshold":500,"consultoria_cs":null,"cs_round_robin":[],"comercial_high":[],"renovacao_cs":null,"rr_cursor":0}'::jsonb);
