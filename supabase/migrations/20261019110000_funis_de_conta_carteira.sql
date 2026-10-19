-- Funis de conta: o card é a empresa, não o negócio.
--
-- No RD, "Gestão da Carteira Comercial" é um funil onde o executivo cuida dos
-- clientes que já tem. Ali não há venda acontecendo: a empresa fica no funil
-- enquanto for cliente, e o que muda é a etapa do relacionamento. Quando surge
-- venda nova (recompra, cross sell), ela vira negócio no funil próprio.
--
-- Por isso o funil de conta é outro objeto: pipelines com tipo 'conta', e
-- company_funis guardando em que etapa cada empresa está. Os relatórios e o
-- kanban de negócios filtram tipo = 'comercial' e seguem iguais.
--
-- Quem é o dono da conta, a gestão define. O executivo move a etapa das
-- empresas dele; trocar o dono só a gestão (ou o servidor, na importação).

ALTER TABLE public.pipelines DROP CONSTRAINT IF EXISTS pipelines_tipo_check;
ALTER TABLE public.pipelines ADD CONSTRAINT pipelines_tipo_check
  CHECK (tipo IN ('comercial', 'cs', 'ticket', 'conta'));
-- (dado/backfill movido para 20261019150000_dados_e_backfills.sql)
-- (dado/backfill movido para 20261019150000_dados_e_backfills.sql)

-- Um negócio nunca entra num funil de conta.
CREATE OR REPLACE FUNCTION public.deals_pipeline_de_negocio()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  IF NEW.pipeline_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.pipelines WHERE id = NEW.pipeline_id AND tipo = 'conta') THEN
    RAISE EXCEPTION 'Funil de conta não recebe negócio';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS deals_pipeline_de_negocio ON public.deals;
CREATE TRIGGER deals_pipeline_de_negocio
  BEFORE INSERT OR UPDATE OF pipeline_id ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.deals_pipeline_de_negocio();

CREATE TABLE IF NOT EXISTS public.company_funis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  pipeline_id uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  stage_id uuid REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  entrou_em timestamptz NOT NULL DEFAULT now(),
  stage_entered_at timestamptz NOT NULL DEFAULT now(),
  observacao text CHECK (char_length(observacao) <= 2000),
  -- rastreio da importação (o card do RD)
  rd_deal_id text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, pipeline_id)
);
CREATE INDEX IF NOT EXISTS idx_company_funis_board ON public.company_funis (pipeline_id, stage_id);
CREATE INDEX IF NOT EXISTS idx_company_funis_owner ON public.company_funis (owner_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS company_funis_rd_deal_key
  ON public.company_funis (rd_deal_id) WHERE rd_deal_id IS NOT NULL;

DROP TRIGGER IF EXISTS company_funis_touch ON public.company_funis;
CREATE TRIGGER company_funis_touch BEFORE UPDATE ON public.company_funis
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Regras que a política sozinha não expressa: etapa do mesmo funil, funil de
-- conta, dono só pela gestão, e o relógio da etapa.
CREATE OR REPLACE FUNCTION public.company_funis_guarda()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_gestao boolean := v_uid IS NULL OR public.is_manager(v_uid);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.pipelines WHERE id = NEW.pipeline_id AND tipo = 'conta') THEN
    RAISE EXCEPTION 'Funil não é de conta';
  END IF;
  IF NEW.stage_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.pipeline_stages
                      WHERE id = NEW.stage_id AND pipeline_id = NEW.pipeline_id) THEN
    RAISE EXCEPTION 'Etapa não pertence ao funil';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT v_gestao THEN NEW.owner_user_id := NULL; END IF;
    NEW.created_by := COALESCE(NEW.created_by, v_uid);
    NEW.stage_entered_at := now();
  ELSE
    IF NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id AND NOT v_gestao THEN
      RAISE EXCEPTION 'O dono da conta é definido pela gestão';
    END IF;
    IF NEW.company_id <> OLD.company_id OR NEW.pipeline_id <> OLD.pipeline_id THEN
      RAISE EXCEPTION 'Card de conta não troca de empresa nem de funil';
    END IF;
    IF NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
      NEW.stage_entered_at := now();
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS company_funis_guarda ON public.company_funis;
CREATE TRIGGER company_funis_guarda BEFORE INSERT OR UPDATE ON public.company_funis
  FOR EACH ROW EXECUTE FUNCTION public.company_funis_guarda();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_funis TO authenticated;
GRANT ALL ON public.company_funis TO service_role;
ALTER TABLE public.company_funis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "company_funis_read" ON public.company_funis;
CREATE POLICY "company_funis_read" ON public.company_funis FOR SELECT TO authenticated
  USING (
    public.is_manager(auth.uid())
    OR public.has_team(auth.uid(), 'comercial')
    OR public.has_team(auth.uid(), 'cs')
    OR public.pode_faturar(auth.uid())
  );
DROP POLICY IF EXISTS "company_funis_insert" ON public.company_funis;
CREATE POLICY "company_funis_insert" ON public.company_funis FOR INSERT TO authenticated
  WITH CHECK (public.is_manager(auth.uid()) OR public.has_team(auth.uid(), 'comercial'));
DROP POLICY IF EXISTS "company_funis_update" ON public.company_funis;
CREATE POLICY "company_funis_update" ON public.company_funis FOR UPDATE TO authenticated
  USING (
    public.is_manager(auth.uid())
    OR (public.has_team(auth.uid(), 'comercial') AND owner_user_id = auth.uid())
  );
DROP POLICY IF EXISTS "company_funis_delete" ON public.company_funis;
CREATE POLICY "company_funis_delete" ON public.company_funis FOR DELETE TO authenticated
  USING (public.is_manager(auth.uid()));

-- Aviso à gestão: empresa nova na carteira esperando dono.
ALTER TABLE public.notificacoes DROP CONSTRAINT IF EXISTS notificacoes_tipo_check;
ALTER TABLE public.notificacoes ADD CONSTRAINT notificacoes_tipo_check CHECK (tipo IN (
  'mencao', 'ganho_para_faturar', 'pendencia_adm', 'pendencia_respondida',
  'requerimento', 'trainer', 'licenca', 'comissao', 'contrato', 'turma', 'carteira'
));

-- Venda ganha põe a empresa na carteira comercial (se ainda não está), na
-- primeira etapa e sem dono, e avisa a gestão para definir (quando quem
-- ganhou foi uma pessoa no sistema).
CREATE OR REPLACE FUNCTION public.deals_entra_na_carteira()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_pipe uuid;
  v_stage uuid;
  v_id uuid;
  v_nome text;
  v_uid text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.pipelines WHERE id = NEW.pipeline_id AND tipo = 'comercial') THEN
    RETURN NEW;
  END IF;
  SELECT id INTO v_pipe FROM public.pipelines WHERE slug = 'gestao-carteira-comercial';
  IF v_pipe IS NULL THEN RETURN NEW; END IF;
  SELECT id INTO v_stage FROM public.pipeline_stages
   WHERE pipeline_id = v_pipe AND kind = 'open' ORDER BY ordem LIMIT 1;

  INSERT INTO public.company_funis (company_id, pipeline_id, stage_id)
  VALUES (NEW.company_id, v_pipe, v_stage)
  ON CONFLICT (company_id, pipeline_id) DO NOTHING
  RETURNING id INTO v_id;

  -- Sem sessão é importação/servidor: milhares de vendas antigas não viram
  -- milhares de avisos; a gestão vê as "sem dono" no quadro.
  IF v_id IS NOT NULL AND auth.uid() IS NOT NULL THEN
    SELECT nome, uid INTO v_nome, v_uid FROM public.companies WHERE id = NEW.company_id;
    INSERT INTO public.notificacoes (user_id, tipo, titulo, corpo, link, deal_id)
    SELECT DISTINCT ur.user_id, 'carteira',
           left('Defina o dono da conta: ' || COALESCE(v_nome, ''), 200),
           'Venda ganha trouxe a empresa para a Gestão da Carteira Comercial.',
           '/carteira-comercial', NEW.id
      FROM public.user_roles ur
     WHERE ur.role::text IN ('gestao', 'super_admin');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS deals_entra_na_carteira ON public.deals;
CREATE TRIGGER deals_entra_na_carteira
  AFTER INSERT OR UPDATE OF status ON public.deals
  FOR EACH ROW WHEN (NEW.status = 'won')
  EXECUTE FUNCTION public.deals_entra_na_carteira();
-- (dado/backfill movido para 20261019150000_dados_e_backfills.sql)

-- O dono da carteira comercial é o dono da empresa: mantém companies em dia
-- para o resto do sistema (negócios de recompra, relatórios por executivo).
CREATE OR REPLACE FUNCTION public.company_funis_dono_na_empresa()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.owner_user_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.pipelines WHERE id = NEW.pipeline_id AND slug = 'gestao-carteira-comercial') THEN
    UPDATE public.companies SET owner_user_id = NEW.owner_user_id
     WHERE id = NEW.company_id AND owner_user_id IS DISTINCT FROM NEW.owner_user_id;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS company_funis_dono_na_empresa ON public.company_funis;
CREATE TRIGGER company_funis_dono_na_empresa
  AFTER INSERT OR UPDATE OF owner_user_id ON public.company_funis
  FOR EACH ROW EXECUTE FUNCTION public.company_funis_dono_na_empresa();
