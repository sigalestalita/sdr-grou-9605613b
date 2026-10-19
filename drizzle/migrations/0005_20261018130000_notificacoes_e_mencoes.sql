-- Notificações e menções entre áreas.
--
-- Briefing: marcar o comercial quando falta informação, em vez de voltar por
-- e-mail. Cada pessoa tem a sua caixa; o sino no topo do app mostra o que não
-- foi lido. Quem cria a notificação é sempre quem está logado (menção) ou o
-- banco (ganho que chega ao ADM).

CREATE TABLE IF NOT EXISTS public.notificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN (
    'mencao', 'ganho_para_faturar', 'pendencia_adm', 'pendencia_respondida',
    'requerimento', 'trainer', 'licenca', 'comissao', 'contrato', 'turma'
  )),
  titulo text NOT NULL CHECK (char_length(titulo) <= 200),
  corpo text CHECK (char_length(corpo) <= 2000),
  -- caminho interno do app (ex.: /negocio/<id>); nunca URL externa
  link text CHECK (link IS NULL OR link ~ '^/[A-Za-z0-9/_?=&.-]*$'),
  deal_id uuid REFERENCES public.deals(id) ON DELETE CASCADE,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  lida_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notificacoes_caixa
  ON public.notificacoes (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notificacoes_nao_lidas
  ON public.notificacoes (user_id) WHERE lida_em IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notificacoes TO authenticated;
GRANT ALL ON public.notificacoes TO service_role;
ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notificacoes_minhas" ON public.notificacoes;
CREATE POLICY "notificacoes_minhas" ON public.notificacoes
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "notificacoes_marcar" ON public.notificacoes;
CREATE POLICY "notificacoes_marcar" ON public.notificacoes
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "notificacoes_apagar" ON public.notificacoes;
CREATE POLICY "notificacoes_apagar" ON public.notificacoes
  FOR DELETE TO authenticated USING (user_id = auth.uid());
-- Sem INSERT direto: quem envia passa por notificar_usuarios, que confere se
-- a pessoa pode mandar aquele tipo (ninguém forja "comissão aprovada").
DROP POLICY IF EXISTS "notificacoes_mencionar" ON public.notificacoes;

/**
 * Envia notificação no nome de quem está logado. Menção: qualquer pessoa.
 * Avisos do ADM (pendência, licença, contrato, turma, trainer, comissão): só
 * quem fatura. Requerimento: ADM ou trainer.
 */
CREATE OR REPLACE FUNCTION public.notificar_usuarios(
  _users uuid[], _tipo text, _titulo text, _corpo text, _link text, _deal_id uuid
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sem sessão'; END IF;
  IF _tipo = 'mencao' THEN
    NULL;
  ELSIF _tipo IN ('pendencia_adm', 'licenca', 'contrato', 'turma', 'trainer', 'comissao') THEN
    IF NOT public.pode_faturar(auth.uid()) THEN
      RAISE EXCEPTION 'Sem permissão para este aviso';
    END IF;
  ELSIF _tipo = 'requerimento' THEN
    IF NOT (public.pode_faturar(auth.uid()) OR public.e_trainer(auth.uid())) THEN
      RAISE EXCEPTION 'Sem permissão para este aviso';
    END IF;
  ELSE
    RAISE EXCEPTION 'Tipo de aviso não pode ser enviado diretamente';
  END IF;
  IF array_length(_users, 1) > 50 THEN RAISE EXCEPTION 'Destinatários demais'; END IF;
  INSERT INTO public.notificacoes (user_id, tipo, titulo, corpo, link, deal_id, criado_por)
  SELECT DISTINCT u, _tipo, left(_titulo, 200), left(_corpo, 2000), _link, _deal_id, auth.uid()
    FROM unnest(_users) u
   WHERE u IS NOT NULL AND u <> auth.uid()
     AND EXISTS (SELECT 1 FROM auth.users au WHERE au.id = u);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

/**
 * Avisa quem fatura (time do módulo administrativo com acesso faturamento ou
 * gestão), menos quem disparou. Usada pelo comercial ao responder pendência
 * e pelo trigger de ganho.
 */
CREATE OR REPLACE FUNCTION public.notificar_faturamento(
  _tipo text, _titulo text, _corpo text, _link text, _deal_id uuid
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sem sessão';
  END IF;
  -- O que o resto da casa pode avisar ao ADM (o ganho é o trigger que avisa).
  IF _tipo NOT IN ('pendencia_respondida', 'requerimento', 'contrato', 'turma', 'comissao') THEN
    RAISE EXCEPTION 'Tipo de aviso não permitido';
  END IF;
  INSERT INTO public.notificacoes (user_id, tipo, titulo, corpo, link, deal_id, criado_por)
  SELECT DISTINCT ut.user_id, _tipo, left(_titulo, 200), left(_corpo, 2000), _link, _deal_id, auth.uid()
    FROM public.user_teams ut
    JOIN public.teams t ON t.slug = ut.team
   WHERE t.ativo AND t.modulo = 'administrativo'
     AND ut.access && ARRAY['faturamento', 'gestao']
     AND ut.user_id IS DISTINCT FROM auth.uid();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.notificar_usuarios(uuid[], text, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notificar_usuarios(uuid[], text, text, text, text, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.notificar_faturamento(text, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notificar_faturamento(text, text, text, text, uuid) TO authenticated, service_role;

/** Ganho com OC chega ao ADM sem e-mail: a esteira saiu de comercial para faturamento. */
CREATE OR REPLACE FUNCTION public.deals_avisa_faturamento()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_empresa text;
BEGIN
  IF NEW.esteira = 'faturamento' AND OLD.esteira = 'comercial' THEN
    SELECT nome INTO v_empresa FROM public.companies WHERE id = NEW.company_id;
    INSERT INTO public.notificacoes (user_id, tipo, titulo, corpo, link, deal_id, criado_por)
    SELECT DISTINCT ut.user_id, 'ganho_para_faturar',
           left('Venda para faturar: ' || COALESCE(v_empresa, NEW.nome), 200),
           left(NEW.nome || COALESCE(' · R$ ' || to_char(NEW.amount, 'FM999G999G990D00'), ''), 2000),
           '/faturamento', NEW.id, auth.uid()
      FROM public.user_teams ut
      JOIN public.teams t ON t.slug = ut.team
     WHERE t.ativo AND t.modulo = 'administrativo'
       AND ut.access && ARRAY['faturamento', 'gestao'];
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.deals_avisa_faturamento() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS deals_avisa_faturamento ON public.deals;
-- Sem "OF esteira": a esteira muda pelo trigger BEFORE (deals_sync_esteira),
-- não pela coluna do UPDATE, e o filtro por coluna não veria a mudança.
CREATE TRIGGER deals_avisa_faturamento
  AFTER UPDATE ON public.deals
  FOR EACH ROW WHEN (OLD.esteira IS DISTINCT FROM NEW.esteira)
  EXECUTE FUNCTION public.deals_avisa_faturamento();
