-- Módulo Administrativo / Faturamento.
--
-- Briefing com a Fabiana (05/10/2026): "não é um módulo financeiro, é um
-- módulo de faturamento". Hoje o ADM recebe o ganho por e-mail, fatura fora
-- do CRM e nada volta: o CRM guarda "faturar tal dia", nunca o faturamento.
--
-- O que esta migration traz:
--   1. Time "Administrativo" (módulo administrativo; acessos faturamento | gestao).
--   2. company_faturamento — a política do cliente (exige OC, janela de
--      emissão, prazo, retenções…) e o código WebMais. Fica visível para o
--      comercial ANTES de negociar: é o que mata a refação de nota e os 60
--      dias perdidos. Filial sem política própria herda a da matriz.
--   3. Campos que o comercial entrega no ganho (CNPJ de faturamento, situação
--      da OC, emissão prevista, prazo, parcelas, contato que recebe a nota).
--   4. faturas + fatura_parcelas — o faturamento de verdade. A primeira nota
--      emitida grava deals.faturado_em, que move a esteira e alimenta a meta
--      da empresa quando app_settings.comercial.meta_base = 'faturamento'.

-- ---------------------------------------------------------------------------
-- 1. Time / módulo Administrativo
-- ---------------------------------------------------------------------------
ALTER TABLE public.teams DROP CONSTRAINT IF EXISTS teams_modulo_check;
ALTER TABLE public.teams ADD CONSTRAINT teams_modulo_check
  CHECK (modulo IN ('comercial', 'cs', 'administrativo'));

CREATE OR REPLACE FUNCTION public.team_access_types(_modulo text)
RETURNS text[]
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE _modulo
    WHEN 'comercial' THEN ARRAY['sdr', 'executivo', 'gestao']
    WHEN 'cs' THEN ARRAY['analista', 'gestao']
    WHEN 'administrativo' THEN ARRAY['faturamento', 'gestao']
    ELSE ARRAY['membro', 'gestao']
  END;
$$;
-- (dado/backfill movido para 20261019150000_dados_e_backfills.sql)

/** Quem mexe no faturamento: time Administrativo ou gestão. */
CREATE OR REPLACE FUNCTION public.pode_faturar(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_manager(_user_id) OR public.has_team(_user_id, 'administrativo')
$$;
REVOKE EXECUTE ON FUNCTION public.pode_faturar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_faturar(uuid) TO authenticated, service_role;

-- O ADM confere e fatura o negócio e corrige o cadastro da empresa: precisa
-- de UPDATE em deals/companies (hoje só comercial, CS e gestão têm).
DROP POLICY IF EXISTS "deals_update_adm" ON public.deals;
CREATE POLICY "deals_update_adm" ON public.deals FOR UPDATE TO authenticated
  USING (public.has_team(auth.uid(), 'administrativo'));
DROP POLICY IF EXISTS "companies_update_adm" ON public.companies;
CREATE POLICY "companies_update_adm" ON public.companies FOR UPDATE TO authenticated
  USING (public.has_team(auth.uid(), 'administrativo'));

-- Pendência devolvida ao comercial e marcos do faturamento viram histórico do
-- negócio, como as atividades do executivo.
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.deal_activities'::regclass AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%tipo%'
  LOOP
    EXECUTE format('ALTER TABLE public.deal_activities DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE public.deal_activities ADD CONSTRAINT deal_activities_tipo_check CHECK (
  tipo IN ('ligacao', 'email', 'reuniao', 'whatsapp', 'nota', 'proposta', 'etapa', 'faturamento')
);
DROP POLICY IF EXISTS "deal_activities_write" ON public.deal_activities;
CREATE POLICY "deal_activities_write" ON public.deal_activities
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_manager(auth.uid())
    OR public.has_team(auth.uid(), 'comercial')
    OR public.has_team(auth.uid(), 'administrativo')
  );

-- ---------------------------------------------------------------------------
-- 2. Política de faturamento do cliente + código WebMais
-- ---------------------------------------------------------------------------
-- Um registro por empresa. Campo NULL = "não definido aqui": na filial, vale
-- o da matriz (companies.parent_company_id). A herança é resolvida na
-- aplicação (src/lib/faturamento/politica.ts).
CREATE TABLE IF NOT EXISTS public.company_faturamento (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  -- Código único do cliente no WebMais (sem API: o ADM digita). Sempre colado
  -- ao CNPJ; é por ele que o executivo descobre que o cliente já tem cadastro.
  codigo_webmais text,
  exige_oc boolean,
  -- Janela do mês em que o cliente aceita receber a nota (dia inicial/final).
  janela_emissao_inicio smallint CHECK (janela_emissao_inicio BETWEEN 1 AND 31),
  janela_emissao_fim smallint CHECK (janela_emissao_fim BETWEEN 1 AND 31),
  -- Prazo de pagamento: N dias após a emissão, todo dia N do mês, ou à vista.
  prazo_tipo text CHECK (prazo_tipo IN ('dias_apos_emissao', 'dia_fixo', 'a_vista')),
  prazo_valor smallint CHECK (prazo_valor BETWEEN 0 AND 365),
  -- "Só paga à vista porque fica devendo": parcelamento bloqueado.
  aceita_parcelamento boolean,
  forma_pagamento text,
  -- Retenções na fonte, em % do valor bruto.
  retencao_iss numeric(5,2) CHECK (retencao_iss BETWEEN 0 AND 100),
  retencao_irrf numeric(5,2) CHECK (retencao_irrf BETWEEN 0 AND 100),
  retencao_pis numeric(5,2) CHECK (retencao_pis BETWEEN 0 AND 100),
  retencao_cofins numeric(5,2) CHECK (retencao_cofins BETWEEN 0 AND 100),
  retencao_csll numeric(5,2) CHECK (retencao_csll BETWEEN 0 AND 100),
  retencao_inss numeric(5,2) CHECK (retencao_inss BETWEEN 0 AND 100),
  -- Dados fiscais que vêm da ficha cadastral (fichacadastral.grougp.com.br).
  regime_tributario text,
  inscricao_estadual text,
  inscricao_municipal text,
  emails_nf text[] NOT NULL DEFAULT '{}',
  ficha_url text,
  ficha_recebida_em timestamptz,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_company_faturamento_webmais
  ON public.company_faturamento (codigo_webmais) WHERE codigo_webmais IS NOT NULL;

COMMENT ON TABLE public.company_faturamento IS
  'Política de faturamento do cliente (regras que hoje vivem em comentários do WebMais). Lida por todos; escrita só pelo Administrativo/gestão.';

DROP TRIGGER IF EXISTS company_faturamento_touch ON public.company_faturamento;
CREATE TRIGGER company_faturamento_touch BEFORE UPDATE ON public.company_faturamento
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_faturamento TO authenticated;
GRANT ALL ON public.company_faturamento TO service_role;
ALTER TABLE public.company_faturamento ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_faturamento_read" ON public.company_faturamento;
CREATE POLICY "company_faturamento_read" ON public.company_faturamento
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "company_faturamento_insert" ON public.company_faturamento;
CREATE POLICY "company_faturamento_insert" ON public.company_faturamento
  FOR INSERT TO authenticated WITH CHECK (public.pode_faturar(auth.uid()));
DROP POLICY IF EXISTS "company_faturamento_update" ON public.company_faturamento;
CREATE POLICY "company_faturamento_update" ON public.company_faturamento
  FOR UPDATE TO authenticated
  USING (public.pode_faturar(auth.uid())) WITH CHECK (public.pode_faturar(auth.uid()));
DROP POLICY IF EXISTS "company_faturamento_delete" ON public.company_faturamento;
CREATE POLICY "company_faturamento_delete" ON public.company_faturamento
  FOR DELETE TO authenticated USING (public.is_manager(auth.uid()));

-- ---------------------------------------------------------------------------
-- 3. O que o comercial entrega no ganho
-- ---------------------------------------------------------------------------
-- Um cliente pode faturar em mais de um CNPJ (Gerdau tem 50): o do ganho não
-- é necessariamente o da empresa.
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS cnpj_faturamento text;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS oc_situacao text
  CHECK (oc_situacao IN ('numero', 'nao_tem', 'anexo'));
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS oc_anexo_url text;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS emissao_prevista_em date;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS prazo_pagamento text;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS forma_pagamento text;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS parcelas smallint CHECK (parcelas BETWEEN 1 AND 24);
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS valor_liquido numeric;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS contato_faturamento_id uuid
  REFERENCES public.contacts(id) ON DELETE SET NULL;
-- Pendência devolvida pelo ADM ao comercial (falta informação para faturar).
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS adm_pendencia text;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS adm_pendencia_em timestamptz;

-- ---------------------------------------------------------------------------
-- 4. Faturas e parcelas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.faturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Registro fiscal: apagar o negócio não apaga a nota.
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE RESTRICT,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  cnpj text,
  numero_nf text NOT NULL,
  emitida_em date NOT NULL,
  valor_bruto numeric(14,2) NOT NULL CHECK (valor_bruto >= 0),
  retencoes numeric(14,2) NOT NULL DEFAULT 0 CHECK (retencoes >= 0),
  valor_liquido numeric(14,2) NOT NULL CHECK (valor_liquido >= 0),
  status text NOT NULL DEFAULT 'emitida' CHECK (status IN ('emitida', 'cancelada')),
  cancelada_em timestamptz,
  cancelada_motivo text,
  observacao text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_faturas_deal ON public.faturas (deal_id);
CREATE INDEX IF NOT EXISTS idx_faturas_emitida ON public.faturas (emitida_em) WHERE status = 'emitida';
CREATE UNIQUE INDEX IF NOT EXISTS uq_faturas_nf_cnpj
  ON public.faturas (numero_nf, COALESCE(cnpj, '')) WHERE status = 'emitida';

CREATE TABLE IF NOT EXISTS public.fatura_parcelas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fatura_id uuid NOT NULL REFERENCES public.faturas(id) ON DELETE CASCADE,
  numero smallint NOT NULL CHECK (numero >= 1),
  vencimento date NOT NULL,
  valor numeric(14,2) NOT NULL CHECK (valor >= 0),
  pago_em date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fatura_id, numero)
);
CREATE INDEX IF NOT EXISTS idx_fatura_parcelas_aberto
  ON public.fatura_parcelas (vencimento) WHERE pago_em IS NULL;

DROP TRIGGER IF EXISTS faturas_touch ON public.faturas;
CREATE TRIGGER faturas_touch BEFORE UPDATE ON public.faturas
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS fatura_parcelas_touch ON public.fatura_parcelas;
CREATE TRIGGER fatura_parcelas_touch BEFORE UPDATE ON public.fatura_parcelas
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

/**
 * deals.faturado_em = emissão da primeira nota válida do negócio. Cancelar a
 * única nota devolve o negócio para "a faturar". A esteira e a meta da
 * empresa leem daqui.
 */
CREATE OR REPLACE FUNCTION public.faturas_sync_deal()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_deal uuid := COALESCE(NEW.deal_id, OLD.deal_id);
  v_primeira date;
BEGIN
  SELECT min(emitida_em) INTO v_primeira
    FROM public.faturas WHERE deal_id = v_deal AND status = 'emitida';
  UPDATE public.deals
     SET faturado_em = CASE WHEN v_primeira IS NULL THEN NULL
                            ELSE (v_primeira::timestamp AT TIME ZONE 'America/Sao_Paulo') END
   WHERE id = v_deal
     AND faturado_em IS DISTINCT FROM
         CASE WHEN v_primeira IS NULL THEN NULL
              ELSE (v_primeira::timestamp AT TIME ZONE 'America/Sao_Paulo') END;
  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.faturas_sync_deal() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS faturas_sync_deal ON public.faturas;
CREATE TRIGGER faturas_sync_deal
  AFTER INSERT OR UPDATE OF status, emitida_em, deal_id OR DELETE ON public.faturas
  FOR EACH ROW EXECUTE FUNCTION public.faturas_sync_deal();

/** Quem vê a nota: ADM, gestão e o executivo dono do negócio. */
CREATE OR REPLACE FUNCTION public.pode_ver_fatura(_deal_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.pode_faturar(auth.uid())
      OR EXISTS (SELECT 1 FROM public.deals d
                  WHERE d.id = _deal_id AND d.executivo_user_id = auth.uid())
$$;
REVOKE EXECUTE ON FUNCTION public.pode_ver_fatura(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_ver_fatura(uuid) TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE ON public.faturas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fatura_parcelas TO authenticated;
GRANT ALL ON public.faturas, public.fatura_parcelas TO service_role;
ALTER TABLE public.faturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fatura_parcelas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "faturas_read" ON public.faturas;
CREATE POLICY "faturas_read" ON public.faturas
  FOR SELECT TO authenticated USING (public.pode_ver_fatura(deal_id));
DROP POLICY IF EXISTS "faturas_insert" ON public.faturas;
CREATE POLICY "faturas_insert" ON public.faturas
  FOR INSERT TO authenticated WITH CHECK (public.pode_faturar(auth.uid()));
-- Nota não se apaga: cancela (status), e o histórico fica.
DROP POLICY IF EXISTS "faturas_update" ON public.faturas;
CREATE POLICY "faturas_update" ON public.faturas
  FOR UPDATE TO authenticated
  USING (public.pode_faturar(auth.uid())) WITH CHECK (public.pode_faturar(auth.uid()));

DROP POLICY IF EXISTS "fatura_parcelas_read" ON public.fatura_parcelas;
CREATE POLICY "fatura_parcelas_read" ON public.fatura_parcelas
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.faturas f
             WHERE f.id = fatura_id AND public.pode_ver_fatura(f.deal_id))
  );
DROP POLICY IF EXISTS "fatura_parcelas_write" ON public.fatura_parcelas;
CREATE POLICY "fatura_parcelas_write" ON public.fatura_parcelas
  FOR ALL TO authenticated
  USING (public.pode_faturar(auth.uid())) WITH CHECK (public.pode_faturar(auth.uid()));
