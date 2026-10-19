-- Solicitação de contrato (minuta/aditivo) e turmas com inscrição.
--
-- Contrato: o momento ficou em aberto no briefing ("às vezes a solicitação vem
-- antes da venda, às vezes durante, às vezes depois"), então a solicitação
-- pode nascer em qualquer negócio. Todos os contratos são feitos e enviados
-- pela Fabi; o que ela pede hoje por e-mail vira os campos: ficha cadastral,
-- proposta final, o que foi comprado, vencimento, regras de parcelamento,
-- valor bruto, contato para envio e observações (na minuta geral, o modelo de
-- compra). 70% dos clientes pedem ajuste: o modelo não é travado, o arquivo
-- final fica no link.
--
-- Turmas: "inscrição, aprovação do administrativo, aluno cai na turma,
-- kick-off e check-in" — hoje trabalho manual da Lauren.

-- ---------------------------------------------------------------------------
-- 1. Contratos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contrato_solicitacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  tipo text NOT NULL DEFAULT 'minuta' CHECK (tipo IN ('minuta', 'aditivo', 'minuta_geral')),
  compra text,
  vencimento date,
  regras_parcelamento text,
  valor_bruto numeric(14,2) CHECK (valor_bruto >= 0),
  contato_envio text,
  modelo_compra text,
  observacoes text,
  ficha_url text,
  proposta_url text,
  status text NOT NULL DEFAULT 'solicitado'
    CHECK (status IN ('solicitado', 'em_elaboracao', 'enviado', 'em_ajuste', 'assinado', 'cancelado')),
  contrato_url text,
  enviado_em timestamptz,
  assinado_em timestamptz,
  solicitado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  responsavel_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_contratos_deal ON public.contrato_solicitacoes (deal_id);
CREATE INDEX IF NOT EXISTS idx_contratos_status ON public.contrato_solicitacoes (status, created_at DESC);
DROP TRIGGER IF EXISTS contrato_solicitacoes_touch ON public.contrato_solicitacoes;
CREATE TRIGGER contrato_solicitacoes_touch BEFORE UPDATE ON public.contrato_solicitacoes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

GRANT SELECT, INSERT, UPDATE ON public.contrato_solicitacoes TO authenticated;
GRANT ALL ON public.contrato_solicitacoes TO service_role;
ALTER TABLE public.contrato_solicitacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "contratos_read" ON public.contrato_solicitacoes;
CREATE POLICY "contratos_read" ON public.contrato_solicitacoes
  FOR SELECT TO authenticated USING (
    public.pode_faturar(auth.uid())
    OR public.has_team(auth.uid(), 'comercial')
    OR public.has_team(auth.uid(), 'cs')
  );
DROP POLICY IF EXISTS "contratos_insert" ON public.contrato_solicitacoes;
CREATE POLICY "contratos_insert" ON public.contrato_solicitacoes
  FOR INSERT TO authenticated WITH CHECK (
    solicitado_por = auth.uid()
    AND (public.has_team(auth.uid(), 'comercial') OR public.has_team(auth.uid(), 'cs')
         OR public.pode_faturar(auth.uid()))
  );
DROP POLICY IF EXISTS "contratos_update" ON public.contrato_solicitacoes;
CREATE POLICY "contratos_update" ON public.contrato_solicitacoes
  FOR UPDATE TO authenticated
  USING (public.pode_faturar(auth.uid()) OR (solicitado_por = auth.uid() AND status = 'solicitado'))
  WITH CHECK (public.pode_faturar(auth.uid()) OR (solicitado_por = auth.uid() AND status = 'solicitado'));

-- ---------------------------------------------------------------------------
-- 2. Turmas e inscrições
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.turmas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  formato text CHECK (formato IN ('online', 'presencial', 'hibrido')),
  inicio date,
  fim date,
  horario text,
  vagas integer CHECK (vagas > 0),
  trainer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  local text,
  link_acesso text,
  kickoff_em timestamptz,
  status text NOT NULL DEFAULT 'aberta'
    CHECK (status IN ('aberta', 'confirmada', 'em_andamento', 'encerrada', 'cancelada')),
  observacoes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (fim IS NULL OR inicio IS NULL OR fim >= inicio)
);
CREATE INDEX IF NOT EXISTS idx_turmas_inicio ON public.turmas (inicio);

CREATE TABLE IF NOT EXISTS public.turma_inscricoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turma_id uuid NOT NULL REFERENCES public.turmas(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  participante_nome text NOT NULL,
  participante_email text,
  participante_telefone text,
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'aprovada', 'recusada', 'cancelada')),
  motivo text,
  aprovado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  aprovado_em timestamptz,
  checkin_em timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_turma_inscricoes_turma ON public.turma_inscricoes (turma_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_turma_inscricao_email
  ON public.turma_inscricoes (turma_id, lower(participante_email))
  WHERE participante_email IS NOT NULL AND status <> 'cancelada';

DROP TRIGGER IF EXISTS turmas_touch ON public.turmas;
CREATE TRIGGER turmas_touch BEFORE UPDATE ON public.turmas
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS turma_inscricoes_touch ON public.turma_inscricoes;
CREATE TRIGGER turma_inscricoes_touch BEFORE UPDATE ON public.turma_inscricoes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

/** Aprovar além das vagas não passa (inclusive com duas aprovações ao mesmo tempo). */
CREATE OR REPLACE FUNCTION public.turma_inscricoes_vagas()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_vagas integer; v_ocupadas integer;
BEGIN
  IF NEW.status = 'aprovada' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'aprovada') THEN
    SELECT vagas INTO v_vagas FROM public.turmas WHERE id = NEW.turma_id FOR UPDATE;
    SELECT count(*) INTO v_ocupadas FROM public.turma_inscricoes
     WHERE turma_id = NEW.turma_id AND status = 'aprovada' AND id <> NEW.id;
    IF v_vagas IS NOT NULL AND v_ocupadas >= v_vagas THEN
      RAISE EXCEPTION 'Turma sem vagas (% de %)', v_ocupadas, v_vagas;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.turma_inscricoes_vagas() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS turma_inscricoes_vagas ON public.turma_inscricoes;
CREATE TRIGGER turma_inscricoes_vagas BEFORE INSERT OR UPDATE ON public.turma_inscricoes
  FOR EACH ROW EXECUTE FUNCTION public.turma_inscricoes_vagas();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.turmas, public.turma_inscricoes TO authenticated;
GRANT ALL ON public.turmas, public.turma_inscricoes TO service_role;
ALTER TABLE public.turmas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.turma_inscricoes ENABLE ROW LEVEL SECURITY;

-- Turmas: todo mundo da casa consulta (o comercial vende vaga); o ADM mantém.
DROP POLICY IF EXISTS "turmas_read" ON public.turmas;
CREATE POLICY "turmas_read" ON public.turmas FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "turmas_write" ON public.turmas;
CREATE POLICY "turmas_write" ON public.turmas FOR ALL TO authenticated
  USING (public.pode_faturar(auth.uid())) WITH CHECK (public.pode_faturar(auth.uid()));

-- Inscrições: dados de participantes (PII) só para quem trabalha com elas.
DROP POLICY IF EXISTS "turma_inscricoes_read" ON public.turma_inscricoes;
CREATE POLICY "turma_inscricoes_read" ON public.turma_inscricoes FOR SELECT TO authenticated
  USING (
    public.pode_faturar(auth.uid())
    OR public.has_team(auth.uid(), 'comercial')
    OR public.has_team(auth.uid(), 'cs')
    OR EXISTS (SELECT 1 FROM public.turmas t WHERE t.id = turma_id AND t.trainer_id = auth.uid())
  );
-- O comercial inscreve (fica pendente); só o ADM aprova.
DROP POLICY IF EXISTS "turma_inscricoes_insert" ON public.turma_inscricoes;
CREATE POLICY "turma_inscricoes_insert" ON public.turma_inscricoes FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (public.pode_faturar(auth.uid())
         OR ((public.has_team(auth.uid(), 'comercial') OR public.has_team(auth.uid(), 'cs'))
             AND status = 'pendente'))
  );
DROP POLICY IF EXISTS "turma_inscricoes_update" ON public.turma_inscricoes;
CREATE POLICY "turma_inscricoes_update" ON public.turma_inscricoes FOR UPDATE TO authenticated
  USING (public.pode_faturar(auth.uid())) WITH CHECK (public.pode_faturar(auth.uid()));
DROP POLICY IF EXISTS "turma_inscricoes_delete" ON public.turma_inscricoes;
CREATE POLICY "turma_inscricoes_delete" ON public.turma_inscricoes FOR DELETE TO authenticated
  USING (public.pode_faturar(auth.uid()) OR (created_by = auth.uid() AND status = 'pendente'));

/** Check-in no dia: a trainer da turma (ou o ADM) marca presença. */
CREATE OR REPLACE FUNCTION public.turma_checkin(_inscricao uuid, _presente boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_trainer uuid; v_status text;
BEGIN
  SELECT t.trainer_id, i.status INTO v_trainer, v_status
    FROM public.turma_inscricoes i JOIN public.turmas t ON t.id = i.turma_id
   WHERE i.id = _inscricao;
  IF v_status IS NULL THEN RAISE EXCEPTION 'Inscrição não encontrada'; END IF;
  IF NOT (v_trainer = auth.uid() OR public.pode_faturar(auth.uid())) THEN
    RAISE EXCEPTION 'Só a trainer da turma (ou o ADM) faz o check-in';
  END IF;
  IF v_status <> 'aprovada' THEN RAISE EXCEPTION 'Só inscrição aprovada faz check-in'; END IF;
  UPDATE public.turma_inscricoes
     SET checkin_em = CASE WHEN _presente THEN now() END
   WHERE id = _inscricao;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.turma_checkin(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.turma_checkin(uuid, boolean) TO authenticated;
