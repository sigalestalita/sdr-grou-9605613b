-- Roteamento é por PORTE (faixa de funcionários do RD, "[Grou] Porte"), não por aporte.
ALTER TABLE public.cs_clients
  ADD COLUMN IF NOT EXISTS porte text,
  ADD COLUMN IF NOT EXISTS num_funcionarios integer;

-- edição manual de porte/funcionários também tem prioridade sobre o RD
CREATE OR REPLACE FUNCTION public.cs_clients_mark_manual()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_prov jsonb := COALESCE(NEW.provenance, '{}'::jsonb);
  col text;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  FOREACH col IN ARRAY ARRAY['nome_empresa','cnpj','setor','tag_uso','tipo_servico','diagnostico_causa',
                             'produtos_ativos','aporte_valor','data_inicio_contrato','data_renovacao',
                             'login_pda','site_url','linkedin_url','tipo_lead','porte','num_funcionarios',
                             'pessoas_mapeadas']
  LOOP
    IF to_jsonb(NEW) -> col IS DISTINCT FROM to_jsonb(OLD) -> col THEN
      v_prov := v_prov || jsonb_build_object(col, 'manual');
    END IF;
  END LOOP;
  NEW.provenance := v_prov;
  RETURN NEW;
END;
$$;
