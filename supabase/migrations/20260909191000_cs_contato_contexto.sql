-- Todo contato registrado na timeline recebe o carimbo da sinaleira daquele
-- momento (cor, semanas na cor, tendência) — Bloco 7 do playbook: "registrar
-- qual era a cor e a tendência no momento do contato".
CREATE OR REPLACE FUNCTION public.cs_signal_context(_client_uid text, _at timestamptz)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_hist text[];
  v_cor text;
  v_semanas int := 0;
  v_tend text := 'estavel';
  v_first text; v_last text; v_streak int := 1; v_distinct int;
  v_rank jsonb := '{"vermelho":1,"amarelo":2,"verde":3}'::jsonb;
  i int;
BEGIN
  SELECT array_agg(s.signal ORDER BY s.week_start) INTO v_hist
  FROM (
    SELECT signal, week_start FROM public.cs_signal_snapshots
    WHERE client_uid = _client_uid
      AND week_start <= (_at AT TIME ZONE 'America/Sao_Paulo')::date
      AND signal NOT IN ('sem_dado', 'preto')
    ORDER BY week_start DESC LIMIT 8
  ) s;
  IF v_hist IS NULL OR array_length(v_hist, 1) = 0 THEN
    SELECT current_signal INTO v_cor FROM public.cs_clients WHERE client_uid = _client_uid;
    RETURN jsonb_build_object('cor', COALESCE(v_cor, 'sem_dado'), 'semanas', 0, 'tendencia', 'estavel');
  END IF;
  v_cor := v_hist[array_length(v_hist, 1)];
  FOR i IN REVERSE array_length(v_hist, 1)..1 LOOP
    IF v_hist[i] = v_cor THEN v_semanas := v_semanas + 1; ELSE EXIT; END IF;
  END LOOP;
  -- tendência: últimas 4 leituras
  v_hist := v_hist[GREATEST(1, array_length(v_hist, 1) - 3):array_length(v_hist, 1)];
  SELECT count(DISTINCT x) INTO v_distinct FROM unnest(v_hist) x;
  IF array_length(v_hist, 1) >= 2 AND v_distinct > 1 THEN
    v_first := v_hist[1]; v_last := v_hist[array_length(v_hist, 1)];
    FOR i IN REVERSE (array_length(v_hist, 1) - 1)..1 LOOP
      IF v_hist[i] = v_last THEN v_streak := v_streak + 1; ELSE EXIT; END IF;
    END LOOP;
    IF v_streak >= 3 THEN v_tend := 'estavel';
    ELSIF (v_rank->>v_last)::int > (v_rank->>v_first)::int THEN v_tend := 'subindo';
    ELSIF (v_rank->>v_last)::int < (v_rank->>v_first)::int THEN v_tend := 'descendo';
    ELSE v_tend := 'oscilando';
    END IF;
  END IF;
  RETURN jsonb_build_object('cor', v_cor, 'semanas', v_semanas, 'tendencia', v_tend);
END;
$$;
GRANT EXECUTE ON FUNCTION public.cs_signal_context(text, timestamptz) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cs_timeline_stamp_signal()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.author_id IS NOT NULL
     AND COALESCE(NEW.channel, '') IN ('ligacao', 'whatsapp', 'email', 'reuniao', 'presencial', 'masterclass')
     AND NOT (COALESCE(NEW.metadata, '{}'::jsonb) ? 'sinaleira') THEN
    NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb)
      || jsonb_build_object('sinaleira', public.cs_signal_context(NEW.client_uid, NEW.occurred_at));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS cs_timeline_stamp_signal ON public.cs_timeline_events;
CREATE TRIGGER cs_timeline_stamp_signal BEFORE INSERT ON public.cs_timeline_events
  FOR EACH ROW EXECUTE FUNCTION public.cs_timeline_stamp_signal();
