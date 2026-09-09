-- CS: reunião realizada como evidência automática.
--
-- 1. Cada analista vincula a própria Google Agenda ao seu login (endereço
--    iCal privado); os eventos entram em cs_calendly_events com provider='google'.
-- 2. Todo evento de agenda (Calendly ou Google) é ligado à empresa pelo e-mail
--    dos convidados: só conta se o convite tem um contato cadastrado da empresa.
-- 3. Quando o evento termina (e não foi cancelado), vira 'reuniao_realizada' na
--    timeline — que conclui tarefas de reunião, a cadência da semana, o último
--    contato e entra no critério "agenda realizada" do health score.

ALTER TABLE public.cs_user_integrations
  ADD COLUMN IF NOT EXISTS gcal_ics_url text,
  ADD COLUMN IF NOT EXISTS gcal_email text,
  ADD COLUMN IF NOT EXISTS gcal_connected_at timestamptz,
  ADD COLUMN IF NOT EXISTS gcal_last_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS gcal_last_error text;

ALTER TABLE public.cs_calendly_events
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'calendly',
  ADD COLUMN IF NOT EXISTS organizer_email text,
  ADD COLUMN IF NOT EXISTS attendees jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.cs_contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS settled_at timestamptz;
CREATE INDEX IF NOT EXISTS cs_calendly_events_settle_idx
  ON public.cs_calendly_events (end_time) WHERE settled_at IS NULL AND client_uid IS NOT NULL;

-- Padrão da evidência passa a incluir reunião.
CREATE OR REPLACE FUNCTION public.cs_evidence_config()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'exigir_evidencia', true,
    'canais', jsonb_build_array('email', 'whatsapp', 'reuniao'),
    'antecedencia_horas', 72,
    'retroativo_horas', 72,
    'gestor_pode_concluir', true,
    'conta_bot', false,
    'reuniao_exige_aceite', false
  ) || COALESCE((SELECT value FROM public.cs_settings WHERE key = 'evidence'), '{}'::jsonb);
$$;

-- ---------------------------------------------------------------------------
-- Convite → contato → empresa
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cs_link_calendar_event()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_emails text[];
  v_contact record;
BEGIN
  -- e-mails dos convidados (Google) + convidado do Calendly
  SELECT array_agg(DISTINCT lower(e)) INTO v_emails
  FROM (
    SELECT jsonb_array_elements(COALESCE(NEW.attendees, '[]'::jsonb))->>'email' AS e
    UNION ALL SELECT NEW.invitee_email
  ) x
  WHERE e IS NOT NULL AND e <> '';
  IF v_emails IS NULL THEN RETURN NEW; END IF;

  SELECT c.client_uid, c.id INTO v_contact
  FROM public.cs_contacts c
  JOIN public.cs_clients cl ON cl.client_uid = c.client_uid AND cl.ativo
  WHERE lower(c.email) = ANY (v_emails)
  ORDER BY c.ativo_no_cliente DESC NULLS LAST, c.updated_at DESC
  LIMIT 1;

  IF v_contact.client_uid IS NOT NULL THEN
    NEW.client_uid := v_contact.client_uid;
    NEW.contact_id := v_contact.id;
    IF NEW.invitee_email IS NULL THEN
      SELECT c.email, c.nome INTO NEW.invitee_email, NEW.invitee_name
      FROM public.cs_contacts c WHERE c.id = v_contact.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS cs_calendar_link ON public.cs_calendly_events;
CREATE TRIGGER cs_calendar_link BEFORE INSERT OR UPDATE OF attendees, invitee_email
  ON public.cs_calendly_events
  FOR EACH ROW EXECUTE FUNCTION public.cs_link_calendar_event();

-- Religa os eventos já sincronizados (Calendly) aos contatos.
UPDATE public.cs_calendly_events SET invitee_email = invitee_email
 WHERE client_uid IS NULL AND invitee_email IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Reunião terminada → timeline (reuniao_realizada)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cs_settle_meetings()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cfg jsonb := public.cs_evidence_config();
  v_aceite boolean := COALESCE((v_cfg->>'reuniao_exige_aceite')::boolean, false);
  v_n integer := 0;
  r record;
  v_part text;
BEGIN
  FOR r IN
    SELECT e.*
    FROM public.cs_calendly_events e
    WHERE e.settled_at IS NULL
      AND e.client_uid IS NOT NULL
      AND COALESCE(e.end_time, e.start_time + interval '1 hour') < now()
      AND e.start_time > now() - interval '120 days'
      AND COALESCE(e.status, 'active') NOT IN ('canceled', 'cancelled')
    ORDER BY e.end_time
    LIMIT 500
  LOOP
    -- resposta do contato no convite (Google): declinou não conta; aceite opcional
    SELECT a->>'status' INTO v_part
    FROM jsonb_array_elements(COALESCE(r.attendees, '[]'::jsonb)) a
    WHERE lower(a->>'email') = lower(COALESCE(r.invitee_email, ''))
    LIMIT 1;
    IF v_part = 'declined' OR (v_aceite AND r.provider = 'google' AND v_part IS DISTINCT FROM 'accepted') THEN
      UPDATE public.cs_calendly_events SET settled_at = now() WHERE id = r.id;
      CONTINUE;
    END IF;

    INSERT INTO public.cs_timeline_events
      (client_uid, author_id, event_type, channel, title, description, occurred_at, metadata)
    VALUES (
      r.client_uid, r.user_id, 'reuniao_realizada', 'reuniao',
      'Reunião realizada' || COALESCE(': ' || NULLIF(r.name, ''), ''),
      NULLIF(concat_ws(' · ', r.invitee_name, r.location), ''),
      COALESCE(r.end_time, r.start_time),
      jsonb_build_object(
        'source', 'cs_calendly_events', 'source_id', r.id::text, 'provider', r.provider,
        'contact_id', r.contact_id, 'invitee_email', r.invitee_email,
        'start_time', r.start_time, 'end_time', r.end_time, 'partstat', v_part,
        'automatico', true)
    )
    ON CONFLICT DO NOTHING;
    UPDATE public.cs_calendly_events SET settled_at = now() WHERE id = r.id;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;
GRANT EXECUTE ON FUNCTION public.cs_settle_meetings() TO authenticated, service_role;

-- Cancelamento depois da liquidação: retira a evidência.
CREATE OR REPLACE FUNCTION public.cs_unsettle_cancelled_meeting()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('canceled', 'cancelled') AND OLD.settled_at IS NOT NULL THEN
    DELETE FROM public.cs_timeline_events
     WHERE metadata->>'source' = 'cs_calendly_events' AND metadata->>'source_id' = NEW.id::text;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS cs_calendar_unsettle ON public.cs_calendly_events;
CREATE TRIGGER cs_calendar_unsettle AFTER UPDATE OF status ON public.cs_calendly_events
  FOR EACH ROW EXECUTE FUNCTION public.cs_unsettle_cancelled_meeting();

-- ---------------------------------------------------------------------------
-- Evidência de reunião conclui tarefas/cadência como e-mail e WhatsApp
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cs_apply_evidence()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cfg jsonb := public.cs_evidence_config();
  v_ahead interval := make_interval(hours => COALESCE((v_cfg->>'antecedencia_horas')::int, 72));
  v_week date;
BEGIN
  IF NEW.event_type NOT IN ('email_enviado', 'whatsapp_enviado', 'reuniao_realizada') THEN
    RETURN NEW;
  END IF;

  UPDATE public.cs_clients
     SET last_contact_at = NEW.occurred_at
   WHERE client_uid = NEW.client_uid
     AND (last_contact_at IS NULL OR last_contact_at < NEW.occurred_at);

  UPDATE public.cs_tasks t
     SET status = 'concluida', done_at = NEW.occurred_at, done_by = NEW.author_id,
         completed_via = 'evidencia', evidence_event_id = NEW.id, evidence_at = NEW.occurred_at
   WHERE t.client_uid = NEW.client_uid
     AND t.status = 'pendente'
     AND t.task_type = NEW.channel
     AND t.due_at <= NEW.occurred_at + v_ahead
     AND (t.contact_id IS NULL OR (NEW.metadata->>'contact_id') IS NULL
          OR t.contact_id::text = NEW.metadata->>'contact_id');

  v_week := (date_trunc('week', (NEW.occurred_at AT TIME ZONE 'America/Sao_Paulo'))::date);
  UPDATE public.cs_cadence_tasks k
     SET done = true, done_at = NEW.occurred_at, done_by = NEW.author_id,
         done_via = 'evidencia', evidence_event_id = NEW.id
   WHERE k.client_uid = NEW.client_uid
     AND NOT k.done
     AND k.week_start BETWEEN v_week - 1 AND v_week + 1
     AND (k.channel IS NULL OR k.channel = NEW.channel);
  RETURN NEW;
END;
$$;

-- Liquidação periódica no próprio banco (não depende do app publicado).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cs-settle-meetings';
    PERFORM cron.schedule('cs-settle-meetings', '*/30 * * * *', $cron$SELECT public.cs_settle_meetings();$cron$);
  END IF;
END $$;
