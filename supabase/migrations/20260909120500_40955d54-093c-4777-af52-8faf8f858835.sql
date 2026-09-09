-- CS: tarefas com conclusão por evidência.
CREATE TABLE IF NOT EXISTS public.cs_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uid text NOT NULL REFERENCES public.cs_clients(client_uid) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.cs_contacts(id) ON DELETE SET NULL,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NOT NULL,
  task_type text NOT NULL DEFAULT 'outro'
    CHECK (task_type IN ('email', 'whatsapp', 'ligacao', 'reuniao', 'outro')),
  due_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'concluida', 'cancelada')),
  done_at timestamptz,
  done_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_via text CHECK (completed_via IN ('evidencia', 'manual', 'gestor')),
  evidence_event_id uuid REFERENCES public.cs_timeline_events(id) ON DELETE SET NULL,
  evidence_at timestamptz,
  notes text,
  source text NOT NULL DEFAULT 'manual',
  source_ref text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cs_tasks_client ON public.cs_tasks(client_uid, status);
CREATE INDEX IF NOT EXISTS idx_cs_tasks_owner_due ON public.cs_tasks(owner_id, status, due_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cs_tasks TO authenticated;
GRANT ALL ON public.cs_tasks TO service_role;
ALTER TABLE public.cs_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cs_tasks_all" ON public.cs_tasks;
CREATE POLICY "cs_tasks_all" ON public.cs_tasks FOR ALL TO authenticated
  USING (public.cs_can_see_client(client_uid)) WITH CHECK (public.cs_can_see_client(client_uid));

-- alias: o repositório chama set_updated_at(); aqui a função existente é touch_updated_at()
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS cs_tasks_touch ON public.cs_tasks;
CREATE TRIGGER cs_tasks_touch BEFORE UPDATE ON public.cs_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Cadência semanal ganha canal e forma de conclusão.
ALTER TABLE public.cs_cadence_tasks
  ADD COLUMN IF NOT EXISTS channel text
    CHECK (channel IS NULL OR channel IN ('email', 'whatsapp', 'ligacao', 'reuniao', 'outro')),
  ADD COLUMN IF NOT EXISTS done_via text
    CHECK (done_via IS NULL OR done_via IN ('evidencia', 'manual', 'gestor')),
  ADD COLUMN IF NOT EXISTS evidence_event_id uuid
    REFERENCES public.cs_timeline_events(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cs_timeline_source
  ON public.cs_timeline_events ((metadata->>'source'), (metadata->>'source_id'))
  WHERE metadata ? 'source_id';

CREATE OR REPLACE FUNCTION public.cs_evidence_config()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'exigir_evidencia', true,
    'canais', jsonb_build_array('email', 'whatsapp'),
    'antecedencia_horas', 72,
    'retroativo_horas', 72,
    'gestor_pode_concluir', true,
    'conta_bot', false
  ) || COALESCE((SELECT value FROM public.cs_settings WHERE key = 'evidence'), '{}'::jsonb);
$$;

CREATE OR REPLACE FUNCTION public.cs_channel_requires_evidence(_channel text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT (cfg->>'exigir_evidencia')::boolean
     AND (cfg->'canais') ? COALESCE(_channel, '')
  FROM public.cs_evidence_config() cfg;
$$;

CREATE OR REPLACE FUNCTION public.cs_phone_digits(_v text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(COALESCE(_v, ''), '\D', '', 'g');
$$;

CREATE OR REPLACE FUNCTION public.cs_contact_for_phone(_phone text)
RETURNS TABLE (client_uid text, contact_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.client_uid, c.id
  FROM public.cs_contacts c
  JOIN public.cs_clients cl ON cl.client_uid = c.client_uid AND cl.ativo
  WHERE length(public.cs_phone_digits(_phone)) >= 8
    AND right(public.cs_phone_digits(c.whatsapp), 8) = right(public.cs_phone_digits(_phone), 8)
  ORDER BY c.ativo_no_cliente DESC NULLS LAST, c.updated_at DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.cs_email_to_timeline()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_out boolean := NEW.direction = 'outbound';
  v_contact uuid;
BEGIN
  IF NEW.client_uid IS NULL THEN RETURN NEW; END IF;
  SELECT c.id INTO v_contact FROM public.cs_contacts c
   WHERE c.client_uid = NEW.client_uid
     AND lower(c.email) = ANY (
       CASE WHEN v_out THEN NEW.to_emails ELSE ARRAY[lower(COALESCE(NEW.from_email, ''))] END)
   LIMIT 1;
  INSERT INTO public.cs_timeline_events
    (client_uid, author_id, event_type, channel, title, description, occurred_at, metadata)
  VALUES (
    NEW.client_uid,
    CASE WHEN v_out THEN NEW.owner_user_id END,
    CASE WHEN v_out THEN 'email_enviado' ELSE 'email_recebido' END,
    'email',
    CASE WHEN v_out THEN 'E-mail enviado' ELSE 'E-mail recebido' END
      || COALESCE(': ' || NULLIF(NEW.subject, ''), ''),
    NULLIF(NEW.snippet, ''),
    NEW.received_at,
    jsonb_build_object(
      'source', 'cs_emails', 'source_id', NEW.id::text, 'direction', NEW.direction,
      'contact_id', v_contact, 'from', NEW.from_email, 'to', to_jsonb(NEW.to_emails),
      'mailbox', NEW.mailbox, 'automatico', true)
  )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS cs_emails_to_timeline ON public.cs_emails;
CREATE TRIGGER cs_emails_to_timeline AFTER INSERT ON public.cs_emails
  FOR EACH ROW EXECUTE FUNCTION public.cs_email_to_timeline();

CREATE OR REPLACE FUNCTION public.cs_whatsapp_to_timeline()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_phone text;
  v_client text;
  v_contact uuid;
  v_out boolean := NEW.sender_type <> 'lead';
  v_sent boolean := NEW.status IN ('sent', 'delivered', 'read');
  v_cfg jsonb := public.cs_evidence_config();
BEGIN
  IF v_out AND NOT v_sent THEN RETURN NEW; END IF;
  IF NEW.sender_type NOT IN ('lead', 'sdr') AND NOT COALESCE((v_cfg->>'conta_bot')::boolean, false) THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(wc.phone, l.phone) INTO v_phone
    FROM public.whatsapp_conversations cv
    LEFT JOIN public.whatsapp_contacts wc ON wc.id = cv.contact_id
    LEFT JOIN public.leads l ON l.id = cv.lead_id
   WHERE cv.id = NEW.conversation_id;
  IF v_phone IS NULL THEN
    SELECT l.phone INTO v_phone FROM public.leads l WHERE l.id = NEW.lead_id;
  END IF;
  SELECT f.client_uid, f.contact_id INTO v_client, v_contact FROM public.cs_contact_for_phone(v_phone) f;
  IF v_client IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.cs_timeline_events
    (client_uid, author_id, event_type, channel, title, description, occurred_at, metadata)
  VALUES (
    v_client,
    CASE WHEN v_out THEN NEW.sender_user_id END,
    CASE WHEN v_out THEN 'whatsapp_enviado' ELSE 'whatsapp_recebido' END,
    'whatsapp',
    CASE WHEN NOT v_out THEN 'WhatsApp recebido'
         WHEN NEW.sender_type = 'sdr' THEN 'WhatsApp enviado'
         ELSE 'WhatsApp enviado (automação)' END,
    left(COALESCE(NULLIF(NEW.body, ''), '[' || NEW.message_type || ']'), 280),
    COALESCE(NEW.sent_at, NEW.created_at),
    jsonb_build_object(
      'source', 'whatsapp_messages', 'source_id', NEW.id::text, 'sender_type', NEW.sender_type,
      'contact_id', v_contact, 'phone', v_phone, 'conversation_id', NEW.conversation_id,
      'automatico', true)
  )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS cs_whatsapp_to_timeline ON public.whatsapp_messages;
CREATE TRIGGER cs_whatsapp_to_timeline
  AFTER INSERT OR UPDATE OF status ON public.whatsapp_messages
  FOR EACH ROW EXECUTE FUNCTION public.cs_whatsapp_to_timeline();

CREATE OR REPLACE FUNCTION public.cs_apply_evidence()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cfg jsonb := public.cs_evidence_config();
  v_ahead interval := make_interval(hours => COALESCE((v_cfg->>'antecedencia_horas')::int, 72));
  v_week date;
BEGIN
  IF NEW.event_type NOT IN ('email_enviado', 'whatsapp_enviado') THEN RETURN NEW; END IF;

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
DROP TRIGGER IF EXISTS cs_timeline_apply_evidence ON public.cs_timeline_events;
CREATE TRIGGER cs_timeline_apply_evidence AFTER INSERT ON public.cs_timeline_events
  FOR EACH ROW EXECUTE FUNCTION public.cs_apply_evidence();

CREATE OR REPLACE FUNCTION public.cs_tasks_guard_manual()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cfg jsonb := public.cs_evidence_config();
BEGIN
  IF NEW.status = 'concluida' AND (OLD.status IS DISTINCT FROM 'concluida') THEN
    IF NEW.completed_via IS NULL THEN NEW.completed_via := 'manual'; END IF;
    IF NEW.done_at IS NULL THEN NEW.done_at := now(); END IF;
    IF NEW.done_by IS NULL THEN NEW.done_by := auth.uid(); END IF;
    IF NEW.completed_via <> 'evidencia' AND public.cs_channel_requires_evidence(NEW.task_type) THEN
      IF NEW.completed_via = 'gestor'
         AND COALESCE((v_cfg->>'gestor_pode_concluir')::boolean, true)
         AND public.is_manager(auth.uid())
         AND length(trim(COALESCE(NEW.notes, ''))) >= 5 THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'Tarefa de % só é concluída pelo registro automático do canal (e-mail/WhatsApp vinculado). A gestão pode concluir com justificativa.',
        NEW.task_type USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS cs_tasks_guard_manual ON public.cs_tasks;
CREATE TRIGGER cs_tasks_guard_manual BEFORE INSERT OR UPDATE ON public.cs_tasks
  FOR EACH ROW EXECUTE FUNCTION public.cs_tasks_guard_manual();

CREATE OR REPLACE FUNCTION public.cs_cadence_guard_manual()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cfg jsonb := public.cs_evidence_config();
BEGIN
  IF NEW.done AND NOT COALESCE(OLD.done, false) THEN
    IF NEW.done_via IS NULL THEN NEW.done_via := 'manual'; END IF;
    IF NEW.done_via <> 'evidencia' AND public.cs_channel_requires_evidence(NEW.channel) THEN
      IF NEW.done_via = 'gestor'
         AND COALESCE((v_cfg->>'gestor_pode_concluir')::boolean, true)
         AND public.is_manager(auth.uid())
         AND length(trim(COALESCE(NEW.notes, ''))) >= 5 THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'Ação de % só é concluída pelo registro automático do canal. A gestão pode concluir com justificativa.',
        NEW.channel USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NOT NEW.done THEN
    NEW.done_via := NULL;
    NEW.evidence_event_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS cs_cadence_guard_manual ON public.cs_cadence_tasks;
CREATE TRIGGER cs_cadence_guard_manual BEFORE INSERT OR UPDATE ON public.cs_cadence_tasks
  FOR EACH ROW EXECUTE FUNCTION public.cs_cadence_guard_manual();

CREATE OR REPLACE FUNCTION public.cs_find_evidence(_client_uid text, _channel text, _since timestamptz)
RETURNS TABLE (event_id uuid, occurred_at timestamptz, title text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT e.id, e.occurred_at, e.title
  FROM public.cs_timeline_events e
  WHERE e.client_uid = _client_uid
    AND e.event_type = _channel || '_enviado'
    AND e.occurred_at >= _since
    AND public.cs_can_see_client(_client_uid)
  ORDER BY e.occurred_at DESC
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.cs_find_evidence(text, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cs_evidence_config() TO authenticated;
GRANT EXECUTE ON FUNCTION public.cs_channel_requires_evidence(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cs_contact_for_phone(text) TO authenticated;

INSERT INTO public.cs_timeline_events
  (client_uid, author_id, event_type, channel, title, description, occurred_at, metadata)
SELECT e.client_uid,
       CASE WHEN e.direction = 'outbound' THEN e.owner_user_id END,
       CASE WHEN e.direction = 'outbound' THEN 'email_enviado' ELSE 'email_recebido' END,
       'email',
       CASE WHEN e.direction = 'outbound' THEN 'E-mail enviado' ELSE 'E-mail recebido' END
         || COALESCE(': ' || NULLIF(e.subject, ''), ''),
       NULLIF(e.snippet, ''),
       e.received_at,
       jsonb_build_object('source', 'cs_emails', 'source_id', e.id::text, 'direction', e.direction,
                          'from', e.from_email, 'to', to_jsonb(e.to_emails), 'mailbox', e.mailbox,
                          'automatico', true, 'reprocessado', true)
FROM public.cs_emails e
WHERE e.client_uid IS NOT NULL
ON CONFLICT DO NOTHING;