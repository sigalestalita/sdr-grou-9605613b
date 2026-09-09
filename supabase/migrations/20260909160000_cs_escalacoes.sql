-- CS: escalação ao gestor.
--
-- Uma ação com a empresa (tarefa, ação de cadência da semana, próximo passo de
-- reunião ou tratativa de alerta) é escalada quando atrasa mais de N dias
-- e/ou quando nada foi feito com aquela empresa desde que a ação venceu.
-- cs_escalations() calcula ao vivo; cs_refresh_escalations() mantém a tabela
-- cs_escalation_notices (histórico, ciência do gestor, controle de e-mail).
-- Configurável em cs_settings.escalation.

CREATE OR REPLACE FUNCTION public.cs_escalation_config()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'dias_atraso', 7,
    'dias_sem_acao', 3,
    'criterio', 'qualquer',
    'notificar_email', true
  ) || COALESCE((SELECT value FROM public.cs_settings WHERE key = 'escalation'), '{}'::jsonb);
$$;
GRANT EXECUTE ON FUNCTION public.cs_escalation_config() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Ações vencidas e o que foi feito com a empresa desde então
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cs_escalations()
RETURNS TABLE (
  kind text,
  ref_id text,
  client_uid text,
  owner_id uuid,
  title text,
  due_at timestamptz,
  days_late integer,
  last_action_at timestamptz,
  acted boolean,
  reason text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cfg jsonb := public.cs_escalation_config();
  v_dias int := COALESCE((v_cfg->>'dias_atraso')::int, 7);
  v_dias_sem int := COALESCE((v_cfg->>'dias_sem_acao')::int, 3);
  v_crit text := COALESCE(v_cfg->>'criterio', 'qualquer');
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_manager(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas a gestão vê as escalações';
  END IF;
  RETURN QUERY
  WITH acoes AS (
    SELECT 'tarefa'::text AS kind, t.id::text AS ref_id, t.client_uid, t.owner_id,
           t.title, t.due_at, t.created_at AS since
      FROM public.cs_tasks t
     WHERE t.status = 'pendente'
    UNION ALL
    SELECT 'cadencia', k.id::text, k.client_uid, k.owner_id,
           COALESCE(NULLIF(k.title, ''), 'Ação de cadência da semana'),
           ((k.week_start + (GREATEST(k.weekday, 1) - 1)) + time '18:00') AT TIME ZONE 'America/Sao_Paulo',
           (k.week_start + time '00:00') AT TIME ZONE 'America/Sao_Paulo'
      FROM public.cs_cadence_tasks k
     WHERE NOT k.done
    UNION ALL
    SELECT 'reuniao', m.id::text, m.client_uid, COALESCE(m.owner_user_id, c.cs_responsavel_id),
           COALESCE(NULLIF(m.next_step, ''), 'Próximo passo — ' || m.title),
           m.next_step_at, m.occurred_at
      FROM public.cs_meetings m
      JOIN public.cs_clients c ON c.client_uid = m.client_uid
     WHERE m.next_step_at IS NOT NULL AND COALESCE(m.status, '') <> 'cancelada'
    UNION ALL
    SELECT 'alerta', a.id::text, a.client_uid, c.cs_responsavel_id,
           'Tratativa de alerta: ' || a.reason, a.follow_up_at, a.created_at
      FROM public.cs_alerts a
      JOIN public.cs_clients c ON c.client_uid = a.client_uid
     WHERE a.status = 'open' AND a.follow_up_at IS NOT NULL
  ),
  vencidas AS (
    SELECT a.*,
           (SELECT max(e.occurred_at) FROM public.cs_timeline_events e
             WHERE e.client_uid = a.client_uid
               AND e.author_id IS NOT NULL
               AND e.occurred_at >= a.since
               AND e.occurred_at <= now()) AS last_action_at
      FROM acoes a
      JOIN public.cs_clients cl ON cl.client_uid = a.client_uid AND cl.ativo
     WHERE a.due_at < now()
  )
  SELECT v.kind, v.ref_id, v.client_uid, v.owner_id, v.title, v.due_at,
         floor(extract(epoch FROM (now() - v.due_at)) / 86400)::int AS days_late,
         v.last_action_at,
         v.last_action_at IS NOT NULL AS acted,
         CASE
           WHEN v.last_action_at IS NULL AND now() - v.due_at >= make_interval(days => v_dias)
             THEN 'atraso_sem_acao'
           WHEN v.last_action_at IS NULL THEN 'sem_acao'
           ELSE 'atraso'
         END AS reason
    FROM vencidas v
   WHERE CASE v_crit
           WHEN 'atraso' THEN now() - v.due_at >= make_interval(days => v_dias)
           WHEN 'sem_acao' THEN v.last_action_at IS NULL AND now() - v.due_at >= make_interval(days => v_dias_sem)
           WHEN 'ambos' THEN v.last_action_at IS NULL AND now() - v.due_at >= make_interval(days => v_dias)
           ELSE now() - v.due_at >= make_interval(days => v_dias)
                OR (v.last_action_at IS NULL AND now() - v.due_at >= make_interval(days => v_dias_sem))
         END
   ORDER BY days_late DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.cs_escalations() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Avisos ao gestor (histórico, ciência, e-mail)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cs_escalation_notices (
  kind text NOT NULL,
  ref_id text NOT NULL,
  client_uid text NOT NULL REFERENCES public.cs_clients(client_uid) ON DELETE CASCADE,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NOT NULL,
  due_at timestamptz NOT NULL,
  days_late integer NOT NULL DEFAULT 0,
  acted boolean NOT NULL DEFAULT false,
  reason text NOT NULL DEFAULT 'atraso',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz,
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text,
  resolved_at timestamptz,
  PRIMARY KEY (kind, ref_id)
);
CREATE INDEX IF NOT EXISTS idx_cs_escalation_active ON public.cs_escalation_notices (owner_id)
  WHERE resolved_at IS NULL;
GRANT SELECT, UPDATE ON public.cs_escalation_notices TO authenticated;
GRANT ALL ON public.cs_escalation_notices TO service_role;
ALTER TABLE public.cs_escalation_notices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cs_escalation_manager" ON public.cs_escalation_notices;
CREATE POLICY "cs_escalation_manager" ON public.cs_escalation_notices FOR ALL TO authenticated
  USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

/** Recalcula e sincroniza os avisos; devolve quantos estão ativos. */
CREATE OR REPLACE FUNCTION public.cs_refresh_escalations()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_run timestamptz := now();
  v_n integer;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_manager(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas a gestão vê as escalações';
  END IF;
  INSERT INTO public.cs_escalation_notices AS n
    (kind, ref_id, client_uid, owner_id, title, due_at, days_late, acted, reason, first_seen_at, last_seen_at)
  SELECT e.kind, e.ref_id, e.client_uid, e.owner_id, e.title, e.due_at, e.days_late, e.acted, e.reason, v_run, v_run
    FROM public.cs_escalations() e
  ON CONFLICT (kind, ref_id) DO UPDATE
    SET owner_id = EXCLUDED.owner_id, title = EXCLUDED.title, due_at = EXCLUDED.due_at,
        days_late = EXCLUDED.days_late, acted = EXCLUDED.acted, reason = EXCLUDED.reason,
        last_seen_at = v_run,
        -- voltou a escalar depois de resolvida: reabre
        resolved_at = NULL,
        first_seen_at = CASE WHEN n.resolved_at IS NOT NULL THEN v_run ELSE n.first_seen_at END,
        acknowledged_at = CASE WHEN n.resolved_at IS NOT NULL THEN NULL ELSE n.acknowledged_at END;
  UPDATE public.cs_escalation_notices
     SET resolved_at = v_run
   WHERE resolved_at IS NULL AND last_seen_at < v_run;
  SELECT count(*) INTO v_n FROM public.cs_escalation_notices WHERE resolved_at IS NULL;
  RETURN v_n;
END;
$$;
GRANT EXECUTE ON FUNCTION public.cs_refresh_escalations() TO authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'cs-refresh-escalations';
    PERFORM cron.schedule('cs-refresh-escalations', '15 * * * *', $cron$SELECT public.cs_refresh_escalations();$cron$);
  END IF;
END $$;
