-- Ciclo de vida da empresa, calculado (não digitado).
--
-- No RD o "ciclo de vida" é um campo que alguém precisa lembrar de mudar, e
-- por isso vive desatualizado. Aqui ele sai do que aconteceu:
--
--   lead          nenhum negócio ainda
--   oportunidade  tem negócio aberto num funil comercial e nunca comprou
--   cliente       ganhou negócio, ou é atendida pelo CS, com licença em dia
--   inativo       foi cliente e a licença PDA venceu (definição da gestão)
--
-- A validade da licença é cs_clients.data_renovacao (a maior, se houver mais
-- de uma ficha). Cliente sem data conhecida segue cliente, a menos que a
-- ficha do CS esteja marcada como inativa.
--
-- Recalcula quando muda negócio ou ficha do CS, e uma vez por dia para pegar
-- as licenças que venceram sem nada mudar.

CREATE OR REPLACE FUNCTION public.ciclo_de_vida_calculado(_company uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH n AS (
    SELECT bool_or(d.status = 'won') AS ganhou,
           bool_or(d.status = 'open') AS aberto
      FROM public.deals d
      JOIN public.pipelines p ON p.id = d.pipeline_id AND p.tipo = 'comercial'
     WHERE d.company_id = _company
  ), cs AS (
    SELECT count(*) > 0 AS tem_ficha,
           bool_or(c.ativo) AS alguma_ativa,
           max(c.data_renovacao) AS vence_em
      FROM public.cs_clients c
     WHERE c.company_id = _company
  )
  SELECT CASE
    WHEN COALESCE(n.ganhou, false) OR cs.tem_ficha THEN
      CASE
        WHEN cs.vence_em IS NOT NULL AND cs.vence_em < (now() AT TIME ZONE 'America/Sao_Paulo')::date
          THEN 'inativo'
        WHEN cs.vence_em IS NULL AND cs.tem_ficha AND NOT COALESCE(cs.alguma_ativa, false)
             AND NOT COALESCE(n.ganhou, false)
          THEN 'inativo'
        ELSE 'cliente'
      END
    WHEN COALESCE(n.aberto, false) THEN 'oportunidade'
    ELSE 'lead'
  END
  FROM n, cs
$$;

CREATE OR REPLACE FUNCTION public.recalcular_ciclo_de_vida(_company uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  UPDATE public.companies c
     SET lifecycle = x.ciclo
    FROM (SELECT id, public.ciclo_de_vida_calculado(id) AS ciclo
            FROM public.companies
           WHERE _company IS NULL OR id = _company) x
   WHERE c.id = x.id AND c.lifecycle IS DISTINCT FROM x.ciclo;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.recalcular_ciclo_de_vida(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalcular_ciclo_de_vida(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.ciclo_de_vida_calculado(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ciclo_de_vida_calculado(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ciclo_de_vida_gatilho()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'INSERT' AND OLD.company_id IS NOT NULL THEN
    PERFORM public.recalcular_ciclo_de_vida(OLD.company_id);
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.company_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.company_id IS DISTINCT FROM OLD.company_id) THEN
    PERFORM public.recalcular_ciclo_de_vida(NEW.company_id);
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS deals_ciclo_de_vida ON public.deals;
CREATE TRIGGER deals_ciclo_de_vida
  AFTER INSERT OR DELETE OR UPDATE OF status, company_id, pipeline_id ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.ciclo_de_vida_gatilho();

DROP TRIGGER IF EXISTS cs_clients_ciclo_de_vida ON public.cs_clients;
CREATE TRIGGER cs_clients_ciclo_de_vida
  AFTER INSERT OR DELETE OR UPDATE OF data_renovacao, ativo, company_id ON public.cs_clients
  FOR EACH ROW EXECUTE FUNCTION public.ciclo_de_vida_gatilho();

-- Empresa recém-criada ainda não tem negócio nem ficha: começa lead, seja
-- qual for o valor que a importação trouxer.
CREATE OR REPLACE FUNCTION public.companies_nasce_lead()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  NEW.lifecycle := 'lead';
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS companies_nasce_lead ON public.companies;
CREATE TRIGGER companies_nasce_lead BEFORE INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.companies_nasce_lead();

-- Valores antigos (vindos do RD/CS) dão lugar ao calculado.
SELECT public.recalcular_ciclo_de_vida(NULL);

DO $$
BEGIN
  PERFORM cron.unschedule('ciclo-de-vida') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ciclo-de-vida');
  -- 03:10 em Brasília: depois da virada do dia em que a licença vence.
  PERFORM cron.schedule('ciclo-de-vida', '10 6 * * *', 'SELECT public.recalcular_ciclo_de_vida(NULL)');
EXCEPTION WHEN undefined_function OR invalid_schema_name OR undefined_table THEN
  RAISE NOTICE 'pg_cron indisponível: rode SELECT public.recalcular_ciclo_de_vida(NULL) diariamente';
END $$;

COMMENT ON COLUMN public.companies.lifecycle IS
  'Calculado por recalcular_ciclo_de_vida: lead | oportunidade | cliente | inativo (licença PDA vencida). Não editar à mão.';
