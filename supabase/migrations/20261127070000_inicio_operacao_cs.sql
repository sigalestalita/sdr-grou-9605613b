-- Dia 1 do CS: nada que venceu antes do início da operação conta como
-- atrasado, e os prazos (etapa, sem contato, cadência) contam a partir dele.
-- A data fica em cs_settings.inicio_operacao e a gestão pode mudar.
INSERT INTO public.cs_settings (key, value)
VALUES ('inicio_operacao', '{"data": "2026-11-27"}'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

CREATE OR REPLACE FUNCTION public.cs_inicio_operacao()
RETURNS timestamptz
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    ((SELECT NULLIF(value->>'data', '') FROM cs_settings WHERE key = 'inicio_operacao')::date
      + time '00:00') AT TIME ZONE 'America/Sao_Paulo',
    '-infinity'::timestamptz)
$$;
GRANT EXECUTE ON FUNCTION public.cs_inicio_operacao() TO authenticated, service_role;

-- Escalações: só o que venceu a partir do início da operação.
DO $x$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef('public.cs_escalations()'::regprocedure) INTO d;
  IF position('cs_inicio_operacao' IN d) = 0 THEN
    d := replace(d, 'WHERE a.due_at < now()',
      'WHERE a.due_at < now()' || chr(10) || '       AND a.due_at >= public.cs_inicio_operacao()');
    IF position('cs_inicio_operacao' IN d) = 0 THEN RAISE EXCEPTION 'cs_escalations mudou'; END IF;
    EXECUTE d;
  END IF;
END $x$;

SELECT public.cs_refresh_escalations();
NOTIFY pgrst, 'reload schema';
