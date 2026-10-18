-- Comissionamento com dupla aprovação e trilha de auditoria.
--
-- Briefing: hoje a comissão vive numa planilha separada porque "todo mundo
-- acessa e todo mundo mexe". É dado de remuneração: o executivo acompanha
-- quanto já tem em função da meta, a Fabiana aprova e mantém o controle, e
-- nenhuma alteração acontece sem as duas partes de acordo.
--
-- Regra (planilha "Planilha Comissões 2026", aba META E COMISSÃO GERAL):
--   base ("ideal") = 5% da meta, separada em produto e serviço;
--   fator pela faixa de atingimento: <50% 0 · 50–59% 20% · 60–69% 30% ·
--   70–79% 40% · 80–89% 50% · 90–99% 80% · ≥100% 100%;
--   super meta = base × (atingimento − 100%), calculada à parte (na planilha
--   ela não entra no total; super_meta_soma decide);
--   realizado produto = PDA + Talogy produto; serviço = PDA + Talogy serviço;
--   Self Guru tem meta própria (R$ 7.000/mês) e fica fora do total.
--
-- Fluxo do fechamento mensal por executivo:
--   aberto → (ADM confere as linhas) conferido_adm → (executivo) aprovado_executivo
--   ou contestado → (ADM) fechado. Qualquer mudança depois de enviado volta
--   para "aberto" e exige nova aprovação. Fechado não muda mais.
--   Toda alteração fica em comissao_eventos (quem, quando, antes e depois).

-- ---------------------------------------------------------------------------
-- Regras por ano
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comissao_regras (
  ano integer PRIMARY KEY CHECK (ano BETWEEN 2020 AND 2100),
  base_pct numeric(5,2) NOT NULL DEFAULT 5 CHECK (base_pct BETWEEN 0 AND 100),
  -- [{min: % de atingimento, fator: % da base}], em ordem crescente
  faixas jsonb NOT NULL DEFAULT '[
    {"min": 0, "fator": 0}, {"min": 50, "fator": 20}, {"min": 60, "fator": 30},
    {"min": 70, "fator": 40}, {"min": 80, "fator": 50}, {"min": 90, "fator": 80},
    {"min": 100, "fator": 100}
  ]'::jsonb,
  super_meta_soma boolean NOT NULL DEFAULT false,
  meta_self_guru_mensal numeric(14,2) NOT NULL DEFAULT 7000,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
INSERT INTO public.comissao_regras (ano) VALUES (2026) ON CONFLICT (ano) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Fechamento mensal e linhas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comissao_fechamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  mes date NOT NULL CHECK (extract(day FROM mes) = 1),
  status text NOT NULL DEFAULT 'aberto'
    CHECK (status IN ('aberto', 'conferido_adm', 'aprovado_executivo', 'contestado', 'fechado')),
  meta_produto numeric(14,2) NOT NULL DEFAULT 0,
  meta_servico numeric(14,2) NOT NULL DEFAULT 0,
  meta_self_guru numeric(14,2) NOT NULL DEFAULT 0,
  realizado_produto numeric(14,2) NOT NULL DEFAULT 0,
  realizado_servico numeric(14,2) NOT NULL DEFAULT 0,
  realizado_self_guru numeric(14,2) NOT NULL DEFAULT 0,
  sem_tipo numeric(14,2) NOT NULL DEFAULT 0,
  comissao_produto numeric(14,2) NOT NULL DEFAULT 0,
  comissao_servico numeric(14,2) NOT NULL DEFAULT 0,
  super_meta numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  contestacao text,
  enviado_em timestamptz,
  aprovado_em timestamptz,
  fechado_em timestamptz,
  fechado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, mes)
);

CREATE TABLE IF NOT EXISTS public.comissao_linhas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fechamento_id uuid NOT NULL REFERENCES public.comissao_fechamentos(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  cliente text,
  item text NOT NULL,
  marca text,
  tipo text CHECK (tipo IN ('produto', 'servico')),
  quantidade numeric,
  valor_original numeric(14,2) NOT NULL DEFAULT 0,
  valor_considerado numeric(14,2) NOT NULL DEFAULT 0,
  parcelas smallint,
  cliente_novo boolean,
  conferida boolean NOT NULL DEFAULT false,
  excluida boolean NOT NULL DEFAULT false,
  ajuste_motivo text,
  origem text NOT NULL DEFAULT 'sistema' CHECK (origem IN ('sistema', 'manual')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- valor mexido ou linha excluída precisa de justificativa
  CHECK ((valor_considerado = valor_original AND NOT excluida) OR char_length(coalesce(ajuste_motivo, '')) >= 3)
);
CREATE INDEX IF NOT EXISTS idx_comissao_linhas_fech ON public.comissao_linhas (fechamento_id);

CREATE TABLE IF NOT EXISTS public.comissao_eventos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fechamento_id uuid NOT NULL REFERENCES public.comissao_fechamentos(id) ON DELETE CASCADE,
  autor uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  acao text NOT NULL,
  antes jsonb,
  depois jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comissao_eventos_fech ON public.comissao_eventos (fechamento_id, created_at);

DROP TRIGGER IF EXISTS comissao_fechamentos_touch ON public.comissao_fechamentos;
CREATE TRIGGER comissao_fechamentos_touch BEFORE UPDATE ON public.comissao_fechamentos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS comissao_linhas_touch ON public.comissao_linhas;
CREATE TRIGGER comissao_linhas_touch BEFORE UPDATE ON public.comissao_linhas
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Integridade: fechado é imutável; mudar linha depois de enviado reabre.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.comissao_linhas_guarda()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_fech uuid := COALESCE(NEW.fechamento_id, OLD.fechamento_id); v_status text;
BEGIN
  SELECT status INTO v_status FROM public.comissao_fechamentos WHERE id = v_fech FOR UPDATE;
  IF v_status = 'fechado' THEN
    RAISE EXCEPTION 'Comissão fechada não pode ser alterada';
  END IF;
  INSERT INTO public.comissao_eventos (fechamento_id, autor, acao, antes, depois)
  VALUES (v_fech, auth.uid(), 'linha_' || lower(TG_OP),
          CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
          CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END);
  -- Mexeu depois de enviar ao executivo: volta para aberto e pede nova aprovação.
  IF v_status IN ('conferido_adm', 'aprovado_executivo', 'contestado') THEN
    UPDATE public.comissao_fechamentos
       SET status = 'aberto', aprovado_em = NULL, enviado_em = NULL
     WHERE id = v_fech;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.comissao_linhas_guarda() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS comissao_linhas_guarda ON public.comissao_linhas;
CREATE TRIGGER comissao_linhas_guarda
  BEFORE INSERT OR UPDATE OR DELETE ON public.comissao_linhas
  FOR EACH ROW EXECUTE FUNCTION public.comissao_linhas_guarda();

CREATE OR REPLACE FUNCTION public.comissao_fechamentos_guarda()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_resposta boolean := current_setting('app.comissao_resposta', true) = '1';
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Todo fechamento nasce em aberto; aprovação e fechamento vêm depois.
    NEW.status := 'aberto';
    NEW.enviado_em := NULL;
    NEW.aprovado_em := NULL;
    NEW.fechado_em := NULL;
    NEW.fechado_por := NULL;
    NEW.contestacao := NULL;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'aberto' THEN
      RAISE EXCEPTION 'Só um fechamento em aberto pode ser apagado';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'fechado' THEN
    RAISE EXCEPTION 'Comissão fechada não pode ser alterada';
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.mes IS DISTINCT FROM OLD.mes THEN
    RAISE EXCEPTION 'Executivo e mês do fechamento não mudam';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- Transições permitidas. Aprovar/contestar é só do executivo, pela
    -- função comissao_responder (que liga app.comissao_resposta).
    IF NOT (
         (OLD.status IN ('aberto', 'contestado') AND NEW.status = 'conferido_adm')
      OR (OLD.status IN ('conferido_adm', 'aprovado_executivo', 'contestado') AND NEW.status = 'aberto')
      OR (OLD.status = 'conferido_adm' AND NEW.status IN ('aprovado_executivo', 'contestado')
          AND v_resposta AND auth.uid() = OLD.user_id)
      OR (OLD.status = 'aprovado_executivo' AND NEW.status = 'fechado')
    ) THEN
      RAISE EXCEPTION 'Mudança de situação não permitida: % → %', OLD.status, NEW.status;
    END IF;
    -- Mudar de situação não mexe em valor: o que foi aprovado é o que fecha.
    IF (NEW.meta_produto, NEW.meta_servico, NEW.meta_self_guru, NEW.realizado_produto,
        NEW.realizado_servico, NEW.realizado_self_guru, NEW.sem_tipo, NEW.comissao_produto,
        NEW.comissao_servico, NEW.super_meta, NEW.total)
       IS DISTINCT FROM
       (OLD.meta_produto, OLD.meta_servico, OLD.meta_self_guru, OLD.realizado_produto,
        OLD.realizado_servico, OLD.realizado_self_guru, OLD.sem_tipo, OLD.comissao_produto,
        OLD.comissao_servico, OLD.super_meta, OLD.total) THEN
      RAISE EXCEPTION 'Valores não mudam junto com a situação; recalcule com o fechamento em aberto';
    END IF;
    RETURN NEW;
  END IF;

  -- Valores mudaram depois de enviado ao executivo: volta para aberto.
  IF OLD.status IN ('conferido_adm', 'aprovado_executivo')
     AND (NEW.meta_produto, NEW.meta_servico, NEW.realizado_produto, NEW.realizado_servico,
          NEW.comissao_produto, NEW.comissao_servico, NEW.super_meta, NEW.total)
         IS DISTINCT FROM
         (OLD.meta_produto, OLD.meta_servico, OLD.realizado_produto, OLD.realizado_servico,
          OLD.comissao_produto, OLD.comissao_servico, OLD.super_meta, OLD.total) THEN
    NEW.status := 'aberto';
    NEW.aprovado_em := NULL;
    NEW.enviado_em := NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.comissao_fechamentos_guarda() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS comissao_fechamentos_guarda ON public.comissao_fechamentos;
CREATE TRIGGER comissao_fechamentos_guarda
  BEFORE INSERT OR UPDATE OR DELETE ON public.comissao_fechamentos
  FOR EACH ROW EXECUTE FUNCTION public.comissao_fechamentos_guarda();

CREATE OR REPLACE FUNCTION public.comissao_fechamentos_audita()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.comissao_eventos (fechamento_id, autor, acao, antes, depois)
  VALUES (NEW.id, auth.uid(),
          CASE WHEN TG_OP = 'INSERT' THEN 'criado'
               WHEN NEW.status IS DISTINCT FROM OLD.status THEN 'status_' || NEW.status
               ELSE 'recalculado' END,
          CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END, to_jsonb(NEW));
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.comissao_fechamentos_audita() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS comissao_fechamentos_audita ON public.comissao_fechamentos;
CREATE TRIGGER comissao_fechamentos_audita
  AFTER INSERT OR UPDATE ON public.comissao_fechamentos
  FOR EACH ROW EXECUTE FUNCTION public.comissao_fechamentos_audita();

/**
 * A resposta do executivo ao fechamento enviado: aprova ou contesta (com o
 * motivo). É o único jeito do executivo mexer no fechamento.
 */
CREATE OR REPLACE FUNCTION public.comissao_responder(_fechamento uuid, _aprova boolean, _texto text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v public.comissao_fechamentos;
BEGIN
  SELECT * INTO v FROM public.comissao_fechamentos WHERE id = _fechamento FOR UPDATE;
  IF v.id IS NULL OR v.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Só o próprio executivo responde ao fechamento dele';
  END IF;
  IF v.status <> 'conferido_adm' THEN
    RAISE EXCEPTION 'Este fechamento não está aguardando a sua aprovação';
  END IF;
  IF NOT _aprova AND char_length(coalesce(trim(_texto), '')) < 3 THEN
    RAISE EXCEPTION 'Diga o que está errado para o ADM revisar';
  END IF;
  PERFORM set_config('app.comissao_resposta', '1', true);
  UPDATE public.comissao_fechamentos
     SET status = CASE WHEN _aprova THEN 'aprovado_executivo' ELSE 'contestado' END,
         aprovado_em = CASE WHEN _aprova THEN now() END,
         contestacao = CASE WHEN _aprova THEN NULL ELSE left(_texto, 4000) END
   WHERE id = _fechamento;
  PERFORM set_config('app.comissao_resposta', '', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.comissao_responder(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.comissao_responder(uuid, boolean, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Acesso: o executivo vê só o dele; quem edita é o ADM (e a gestão).
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON public.comissao_regras TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comissao_fechamentos, public.comissao_linhas TO authenticated;
GRANT SELECT ON public.comissao_eventos TO authenticated;
GRANT ALL ON public.comissao_regras, public.comissao_fechamentos, public.comissao_linhas, public.comissao_eventos TO service_role;
ALTER TABLE public.comissao_regras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comissao_fechamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comissao_linhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comissao_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comissao_regras_read" ON public.comissao_regras;
CREATE POLICY "comissao_regras_read" ON public.comissao_regras
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "comissao_regras_write" ON public.comissao_regras;
CREATE POLICY "comissao_regras_write" ON public.comissao_regras
  FOR ALL TO authenticated
  USING (public.pode_faturar(auth.uid())) WITH CHECK (public.pode_faturar(auth.uid()));

DROP POLICY IF EXISTS "comissao_fechamentos_read" ON public.comissao_fechamentos;
CREATE POLICY "comissao_fechamentos_read" ON public.comissao_fechamentos
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.pode_faturar(auth.uid()));
DROP POLICY IF EXISTS "comissao_fechamentos_write" ON public.comissao_fechamentos;
CREATE POLICY "comissao_fechamentos_write" ON public.comissao_fechamentos
  FOR ALL TO authenticated
  USING (public.pode_faturar(auth.uid())) WITH CHECK (public.pode_faturar(auth.uid()));

DROP POLICY IF EXISTS "comissao_linhas_read" ON public.comissao_linhas;
CREATE POLICY "comissao_linhas_read" ON public.comissao_linhas
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.comissao_fechamentos f
             WHERE f.id = fechamento_id
               AND (f.user_id = auth.uid() OR public.pode_faturar(auth.uid())))
  );
DROP POLICY IF EXISTS "comissao_linhas_write" ON public.comissao_linhas;
CREATE POLICY "comissao_linhas_write" ON public.comissao_linhas
  FOR ALL TO authenticated
  USING (public.pode_faturar(auth.uid())) WITH CHECK (public.pode_faturar(auth.uid()));

-- Eventos: só leitura (quem grava são os triggers).
DROP POLICY IF EXISTS "comissao_eventos_read" ON public.comissao_eventos;
CREATE POLICY "comissao_eventos_read" ON public.comissao_eventos
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.comissao_fechamentos f
             WHERE f.id = fechamento_id
               AND (f.user_id = auth.uid() OR public.pode_faturar(auth.uid())))
  );
