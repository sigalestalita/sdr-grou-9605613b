-- cs_clients ganha provenance por campo (como companies): a importação do RD
-- só preenche o que não foi editado à mão. Edições pela interface (sessão de
-- usuário) marcam o campo como 'manual'; o serviço (RD) grava 'rd'.
ALTER TABLE public.cs_clients ADD COLUMN IF NOT EXISTS provenance jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.cs_clients_mark_manual()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_prov jsonb := COALESCE(NEW.provenance, '{}'::jsonb);
  col text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF; -- serviço/importação: não marca
  FOREACH col IN ARRAY ARRAY['nome_empresa','cnpj','setor','tag_uso','tipo_servico','diagnostico_causa',
                             'produtos_ativos','aporte_valor','data_inicio_contrato','data_renovacao',
                             'login_pda','site_url','linkedin_url','tipo_lead']
  LOOP
    IF to_jsonb(NEW) -> col IS DISTINCT FROM to_jsonb(OLD) -> col THEN
      v_prov := v_prov || jsonb_build_object(col, 'manual');
    END IF;
  END LOOP;
  NEW.provenance := v_prov;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS cs_clients_mark_manual ON public.cs_clients;
CREATE TRIGGER cs_clients_mark_manual BEFORE UPDATE ON public.cs_clients
  FOR EACH ROW EXECUTE FUNCTION public.cs_clients_mark_manual();