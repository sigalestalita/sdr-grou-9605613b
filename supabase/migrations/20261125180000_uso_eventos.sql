-- Logs de uso do Compass: quem entrou, que telas abriu e por quanto tempo
-- ficou ativo. Gravado pelo próprio app (server function, service role) a
-- cada sessão, troca de tela e, com a aba à vista e a pessoa mexendo, a cada
-- 5 minutos. Só o servidor lê e escreve: RLS ligado e nenhuma policy.
--
-- user_id sem chave estrangeira de propósito: remover um usuário não apaga o
-- histórico de uso dele.
CREATE TABLE IF NOT EXISTS public.uso_eventos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL,
  sessao uuid NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('entrada', 'pagina', 'ativo')),
  rota text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS uso_eventos_user_created_idx
  ON public.uso_eventos (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS uso_eventos_created_idx
  ON public.uso_eventos (created_at DESC);

ALTER TABLE public.uso_eventos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.uso_eventos FROM anon, authenticated;

-- Resumo por pessoa no período. Tempo ativo = blocos de 5 minutos (por
-- sessão) em que houve qualquer evento: uma tela aberta e esquecida não conta,
-- porque o app só manda o sinal de "ativo" com a aba à vista e interação.
CREATE OR REPLACE FUNCTION public.uso_resumo(p_de timestamptz, p_ate timestamptz)
RETURNS TABLE (
  user_id uuid,
  sessoes bigint,
  dias_ativos bigint,
  paginas bigint,
  minutos_ativos bigint,
  primeiro timestamptz,
  ultimo timestamptz
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
    5 * count(DISTINCT (e.sessao, floor(extract(epoch FROM e.created_at) / 300))),
    min(e.created_at),
    max(e.created_at)
  FROM public.uso_eventos e
  WHERE e.created_at >= p_de AND e.created_at < p_ate
  GROUP BY e.user_id;
$$;

-- Telas mais abertas por pessoa no período (ids na rota viram :id).
CREATE OR REPLACE FUNCTION public.uso_telas(p_de timestamptz, p_ate timestamptz)
RETURNS TABLE (user_id uuid, rota text, n bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    e.user_id,
    regexp_replace(
      coalesce(e.rota, ''),
      '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}',
      ':id',
      'g'
    ) AS rota,
    count(*)
  FROM public.uso_eventos e
  WHERE e.created_at >= p_de AND e.created_at < p_ate AND e.tipo = 'pagina'
  GROUP BY 1, 2;
$$;

-- Último uso de cada pessoa, em qualquer data (para quem não usou no período).
CREATE OR REPLACE FUNCTION public.uso_ultimo_acesso()
RETURNS TABLE (user_id uuid, ultimo timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.user_id, max(e.created_at) FROM public.uso_eventos e GROUP BY e.user_id;
$$;

REVOKE ALL ON FUNCTION public.uso_resumo(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.uso_telas(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.uso_ultimo_acesso() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.uso_resumo(timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.uso_telas(timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.uso_ultimo_acesso() TO service_role;
