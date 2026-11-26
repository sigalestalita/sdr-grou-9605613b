-- Agenda de tarefas do CS: a configuração (dias, horário, atendimentos por
-- dia, feriados, exceções por pessoa) fica em cs_settings 'agenda_tarefas'.
-- Aqui ficam as ausências (férias, licença, folga), com substituto opcional, e
-- a escalação deixa de cobrar quem está ausente.
CREATE TABLE IF NOT EXISTS public.cs_ausencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  inicio date NOT NULL,
  fim date NOT NULL,
  motivo text NOT NULL DEFAULT 'férias',
  substituto_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  observacao text,
  criado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CHECK (fim >= inicio)
);
CREATE INDEX IF NOT EXISTS cs_ausencias_user_idx ON public.cs_ausencias (user_id, inicio, fim);

ALTER TABLE public.cs_ausencias ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cs_ausencias TO authenticated;
GRANT ALL ON public.cs_ausencias TO service_role;
DROP POLICY IF EXISTS cs_ausencias_ler ON public.cs_ausencias;
CREATE POLICY cs_ausencias_ler ON public.cs_ausencias
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS cs_ausencias_gestao ON public.cs_ausencias;
CREATE POLICY cs_ausencias_gestao ON public.cs_ausencias
  FOR ALL TO authenticated USING (public.is_manager(auth.uid()))
  WITH CHECK (public.is_manager(auth.uid()));

/* Quem está ausente hoje (horário de Brasília). */
CREATE OR REPLACE FUNCTION public.cs_ausente_hoje(_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM cs_ausencias a
     WHERE a.user_id = _user
       AND (now() AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN a.inicio AND a.fim)
$$;

NOTIFY pgrst, 'reload schema';

/* Escalação: quem está ausente (férias, licença) não é cobrado enquanto estiver fora. */
CREATE OR REPLACE FUNCTION public.cs_escalations()
 RETURNS TABLE(kind text, ref_id text, client_uid text, owner_id uuid, title text, due_at timestamp with time zone, days_late integer, last_action_at timestamp with time zone, acted boolean, reason text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
       AND (a.owner_id IS NULL OR NOT public.cs_ausente_hoje(a.owner_id))
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
$function$;

NOTIFY pgrst, 'reload schema';
