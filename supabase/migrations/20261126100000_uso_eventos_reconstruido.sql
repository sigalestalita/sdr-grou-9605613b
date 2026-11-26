-- Logs de uso reconstruídos: o registro de uso só existe desde o deploy de
-- 25/11/2026. Para os dias anteriores, o uso é reconstruído a partir do que o
-- banco já guardava, marcado como reconstruido = true:
--   * 'aberto': renovação do login (auth.refresh_tokens, mais ou menos de hora
--     em hora com o Compass aberto, inclusive aba esquecida). Não conta como
--     tempo ativo nem como tela.
--   * 'pagina': card de lead aberto (lead_interactions card_opened) → /lead/<id>.
--   * 'acao': o que a pessoa fez — mudança de etapa, toque, WhatsApp digitado
--     no Compass (sem campanha e sem IA), tarefa e registro do CS, nota.
-- origem_id evita carregar o mesmo fato duas vezes (pode rodar de novo).

ALTER TABLE public.uso_eventos
  ADD COLUMN IF NOT EXISTS reconstruido boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS detalhe text,
  ADD COLUMN IF NOT EXISTS origem_id text;

CREATE UNIQUE INDEX IF NOT EXISTS uso_eventos_origem_idx
  ON public.uso_eventos (origem_id) WHERE origem_id IS NOT NULL;

ALTER TABLE public.uso_eventos DROP CONSTRAINT IF EXISTS uso_eventos_tipo_check;
ALTER TABLE public.uso_eventos ADD CONSTRAINT uso_eventos_tipo_check
  CHECK (tipo IN ('entrada', 'pagina', 'ativo', 'acao', 'aberto'));

-- Tempo ativo não conta 'aberto' (renovação de login acontece com a aba
-- parada). "reconstruidos" diz quantos eventos da pessoa no período vieram
-- da reconstrução.
DROP FUNCTION IF EXISTS public.uso_resumo(timestamptz, timestamptz);
CREATE FUNCTION public.uso_resumo(p_de timestamptz, p_ate timestamptz)
RETURNS TABLE (
  user_id uuid,
  sessoes bigint,
  dias_ativos bigint,
  paginas bigint,
  minutos_ativos bigint,
  primeiro timestamptz,
  ultimo timestamptz,
  reconstruidos bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.user_id,
    count(DISTINCT e.sessao),
    count(DISTINCT (e.created_at AT TIME ZONE 'America/Sao_Paulo')::date),
    count(*) FILTER (WHERE e.tipo = 'pagina'),
    5 * count(DISTINCT (e.sessao, floor(extract(epoch FROM e.created_at) / 300)))
      FILTER (WHERE e.tipo <> 'aberto'),
    min(e.created_at),
    max(e.created_at),
    count(*) FILTER (WHERE e.reconstruido)
  FROM public.uso_eventos e
  WHERE e.created_at >= p_de AND e.created_at < p_ate
  GROUP BY e.user_id;
$$;
REVOKE ALL ON FUNCTION public.uso_resumo(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.uso_resumo(timestamptz, timestamptz) TO service_role;

-- Carga: de 23/11/2026 00:00 (Brasília) até o primeiro evento real gravado
-- pelo app (sem ele, até agora). A sessão de cada ação é a sessão de login em
-- que a pessoa estava naquele momento.
DO $$
DECLARE
  v_de timestamptz := timestamptz '2026-11-23 00:00:00-03';
  v_ate timestamptz;
BEGIN
  SELECT coalesce(min(created_at), now()) INTO v_ate
    FROM public.uso_eventos WHERE NOT reconstruido;

  CREATE TEMP TABLE _sessoes ON COMMIT DROP AS
    SELECT r.user_id::uuid AS user_id, r.created_at, r.session_id, r.id
    FROM auth.refresh_tokens r
    WHERE r.user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND r.session_id IS NOT NULL
      AND r.created_at >= v_de - interval '1 day' AND r.created_at < v_ate;

  CREATE TEMP TABLE _fatos (
    origem_id text, user_id uuid, created_at timestamptz,
    tipo text, rota text, detalhe text
  ) ON COMMIT DROP;

  INSERT INTO _fatos
    SELECT 'rt:' || id, user_id, created_at, 'aberto', NULL, 'Compass aberto (renovação do login)'
    FROM _sessoes WHERE created_at >= v_de;

  INSERT INTO _fatos
    SELECT 'li:' || i.id, i.author_id, i.created_at,
      CASE WHEN i.type = 'card_opened' THEN 'pagina' ELSE 'acao' END,
      '/lead/' || i.lead_id,
      CASE WHEN i.type = 'card_opened' THEN 'Abriu o card do lead'
           ELSE 'Mudou a etapa do lead' ||
             coalesce(': ' || (i.metadata->>'from_stage_name') || ' → ' || (i.metadata->>'to_stage_name'), '')
      END
    FROM public.lead_interactions i
    WHERE i.type IN ('card_opened', 'status_change') AND i.author_id IS NOT NULL
      AND i.created_at >= v_de AND i.created_at < v_ate;

  INSERT INTO _fatos
    SELECT 'lt:' || t.id, t.author_id, t.created_at, 'acao', '/lead/' || t.lead_id,
      'Registrou toque: ' || coalesce(t.channel, '?') || coalesce(' · ' || t.action_type, '')
    FROM public.lead_touches t
    WHERE t.author_id IS NOT NULL AND t.created_at >= v_de AND t.created_at < v_ate;

  INSERT INTO _fatos
    SELECT 'wa:' || m.id, m.sender_user_id, m.created_at, 'acao',
      CASE WHEN m.lead_id IS NOT NULL THEN '/lead/' || m.lead_id ELSE '/whatsapp' END,
      'Enviou mensagem de WhatsApp'
    FROM public.whatsapp_messages m
    WHERE m.sender_type = 'sdr' AND m.sender_user_id IS NOT NULL
      AND m.created_at >= v_de AND m.created_at < v_ate
      AND NOT EXISTS (SELECT 1 FROM public.whatsapp_campaign_messages c WHERE c.message_id = m.id);

  INSERT INTO _fatos
    SELECT 'ct:' || c.id, c.done_by, c.done_at, 'acao', '/cs-kanban',
      'Concluiu tarefa da cadência do CS' || coalesce(': ' || c.title, '')
    FROM public.cs_cadence_tasks c
    WHERE c.done_by IS NOT NULL AND c.done_at >= v_de AND c.done_at < v_ate;

  INSERT INTO _fatos
    SELECT 'ce:' || e.id, e.author_id, e.created_at, 'acao', '/empresas/' || e.client_uid,
      'Registro no CS' || coalesce(': ' || e.title, '')
    FROM public.cs_timeline_events e
    WHERE e.author_id IS NOT NULL AND e.created_at >= v_de AND e.created_at < v_ate;

  INSERT INTO _fatos
    SELECT 'ln:' || n.id, n.author_id, n.created_at, 'acao', '/lead/' || n.lead_id, 'Escreveu nota no lead'
    FROM public.lead_notes n
    WHERE n.author_id IS NOT NULL AND n.created_at >= v_de AND n.created_at < v_ate;

  INSERT INTO public.uso_eventos
    (user_id, sessao, tipo, rota, created_at, reconstruido, detalhe, origem_id)
  SELECT f.user_id,
    coalesce(
      (SELECT s.session_id FROM _sessoes s
        WHERE s.user_id = f.user_id AND s.created_at <= f.created_at
        ORDER BY s.created_at DESC LIMIT 1),
      -- sem sessão de login conhecida: uma por pessoa e dia
      md5(f.user_id::text || (f.created_at AT TIME ZONE 'America/Sao_Paulo')::date::text)::uuid
    ),
    f.tipo, left(f.rota, 300), f.created_at, true, left(f.detalhe, 300), f.origem_id
  FROM _fatos f
  ON CONFLICT (origem_id) WHERE origem_id IS NOT NULL DO NOTHING;
END $$;
