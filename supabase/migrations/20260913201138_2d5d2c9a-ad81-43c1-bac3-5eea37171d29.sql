-- Fecha o search_path das funções criadas no módulo comercial.
CREATE OR REPLACE FUNCTION public.deal_data_ganho(_deal public.deals)
RETURNS timestamptz
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _deal.status <> 'won' THEN NULL
    ELSE COALESCE(_deal.ordem_compra_em, _deal.closed_at)
  END;
$$;

CREATE OR REPLACE FUNCTION public.deals_sync_esteira()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.cs_entregue_em IS NOT NULL THEN
    NEW.esteira := 'cs';
  ELSIF NEW.faturado_em IS NOT NULL OR NEW.adm_checked_at IS NOT NULL THEN
    NEW.esteira := 'faturamento';
  ELSIF NEW.status = 'won' AND NEW.ordem_compra_em IS NOT NULL THEN
    NEW.esteira := 'faturamento';
  ELSE
    NEW.esteira := 'comercial';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;