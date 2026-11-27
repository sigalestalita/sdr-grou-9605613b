-- Releitura diária do RD: o que uma pessoa muda num negócio pelo Compass vale
-- mais que o RD. Cada campo alimentado pelo RD que alguém altera (sessão de
-- usuário, auth.uid() presente) fica marcado como 'manual' em provenance, e a
-- transformação do RD pula campos 'manual' (applyWithProvenance).
CREATE OR REPLACE FUNCTION public.deals_marca_edicao_manual()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  campos text[] := ARRAY['nome','status','amount','closed_at','fonte','campanha','pipeline_id','stage_id',
    'owner_user_id','sdr_user_id','executivo_user_id','devolutiva_user_id','company_id','contact_id',
    'agendado_em','devolutiva_em','lost_note','lost_reason','motivo_venda','observacao_adm','reuniao_em',
    'status_reuniao','temperatura','tipo_venda','trilha'];
  c text;
  novo jsonb := to_jsonb(NEW);
  velho jsonb := to_jsonb(OLD);
  prov jsonb := coalesce(NEW.provenance, '{}'::jsonb);
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  FOREACH c IN ARRAY campos LOOP
    IF (novo -> c) IS DISTINCT FROM (velho -> c) THEN
      prov := prov || jsonb_build_object(c, 'manual');
    END IF;
  END LOOP;
  NEW.provenance := prov;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS deals_marca_edicao_manual ON public.deals;
CREATE TRIGGER deals_marca_edicao_manual BEFORE UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.deals_marca_edicao_manual();
