-- Conta Azul (substitui a WebMais a partir da migração de 24-25/11).
--
-- A Conta Azul não tem webhook: o Compass lê de 15 em 15 minutos o que mudou
-- (vendas, notas de serviço e contas a receber) e guarda uma cópia enxuta
-- aqui. A nota continua sendo emitida na Conta Azul; o Compass só fica
-- sabendo se a venda foi faturada, se a nota falhou/foi cancelada e se o
-- cliente está em atraso.

-- Conexão (OAuth2). Só o servidor lê (sem política = ninguém do app lê).
CREATE TABLE IF NOT EXISTS public.contaazul_tokens (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  connected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.contaazul_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contaazul_tokens FROM anon, authenticated;
GRANT ALL ON public.contaazul_tokens TO service_role;

-- Cópias da Conta Azul.
CREATE TABLE IF NOT EXISTS public.ca_vendas (
  id text PRIMARY KEY,                 -- UUID da venda na Conta Azul
  numero integer,
  situacao text,                       -- EM_ANDAMENTO, APROVADO, FATURADO, CANCELADO…
  cliente_id text,
  cliente_nome text,
  total numeric(14,2),
  data date,
  data_alteracao timestamptz,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ca_vendas_numero_idx ON public.ca_vendas (numero);
CREATE INDEX IF NOT EXISTS ca_vendas_company_idx ON public.ca_vendas (company_id);

CREATE TABLE IF NOT EXISTS public.ca_notas (
  id text PRIMARY KEY,
  id_venda text,
  numero_venda text,
  numero_nfse text,
  status text,                         -- EMITIDA, CANCELADA, FALHA, DENEGADA…
  documento_cliente text,              -- só dígitos
  nome_cliente text,
  valor numeric(14,2),
  data_competencia date,
  motivo_cancelamento text,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ca_notas_venda_idx ON public.ca_notas (id_venda);
CREATE INDEX IF NOT EXISTS ca_notas_company_idx ON public.ca_notas (company_id);

CREATE TABLE IF NOT EXISTS public.ca_receber (
  id text PRIMARY KEY,
  descricao text,
  cliente_id text,
  cliente_nome text,
  data_vencimento date,
  status text,                         -- EM_ABERTO, ATRASADO, RECEBIDO, RECEBIDO_PARCIAL, PERDIDO, RENEGOCIADO
  total numeric(14,2),
  pago numeric(14,2),
  nao_pago numeric(14,2),
  data_alteracao timestamptz,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ca_receber_company_idx ON public.ca_receber (company_id);
CREATE INDEX IF NOT EXISTS ca_receber_cliente_idx ON public.ca_receber (cliente_id);

-- Cliente da Conta Azul → empresa do Compass (pelo CNPJ que vem nas notas).
CREATE TABLE IF NOT EXISTS public.ca_clientes (
  cliente_id text PRIMARY KEY,
  documento text,
  nome text,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ca_vendas','ca_notas','ca_receber','ca_clientes'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_read', t);
    -- Financeiro: ADM e gestão. O executivo vê o resumo no negócio e o alerta de atraso.
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.pode_faturar(auth.uid()))',
      t || '_read', t);
  END LOOP;
END $$;

-- Negócio ligado à venda da Conta Azul: o que o executivo vendeu (amount) e
-- o que foi faturado (notas emitidas da venda).
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS ca_venda_id text,
  ADD COLUMN IF NOT EXISTS ca_venda_numero integer,
  ADD COLUMN IF NOT EXISTS ca_situacao text,
  ADD COLUMN IF NOT EXISTS ca_nf_status text,
  ADD COLUMN IF NOT EXISTS ca_nf_numeros text,
  ADD COLUMN IF NOT EXISTS ca_valor_faturado numeric(14,2),
  ADD COLUMN IF NOT EXISTS ca_sincronizado_em timestamptz;
CREATE INDEX IF NOT EXISTS deals_ca_venda_idx ON public.deals (ca_venda_id);

-- Cliente em atraso: passa a somar também o contas a receber da Conta Azul.
CREATE OR REPLACE FUNCTION public.empresa_em_atraso(_company uuid)
RETURNS TABLE (parcelas integer, valor numeric, mais_antiga date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH hoje AS (SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date d),
  vencidas AS (
    SELECT p.valor, p.vencimento
      FROM public.fatura_parcelas p
      JOIN public.faturas f ON f.id = p.fatura_id
      JOIN public.deals dl ON dl.id = f.deal_id, hoje
     WHERE dl.company_id = _company AND f.status <> 'cancelada'
       AND p.pago_em IS NULL AND p.vencimento < hoje.d
    UNION ALL
    SELECT COALESCE(r.nao_pago, r.total), r.data_vencimento
      FROM public.ca_receber r, hoje
     WHERE r.company_id = _company
       AND r.status IN ('ATRASADO', 'EM_ABERTO', 'RECEBIDO_PARCIAL', 'OVERDUE')
       AND COALESCE(r.nao_pago, r.total, 0) > 0
       AND r.data_vencimento < hoje.d
  )
  SELECT count(*)::int, COALESCE(sum(valor), 0), min(vencimento)
    FROM vencidas
   WHERE auth.uid() IS NOT NULL OR current_user = 'service_role'
$$;
REVOKE EXECUTE ON FUNCTION public.empresa_em_atraso(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.empresa_em_atraso(uuid) TO authenticated, service_role;

-- Leitura a cada 15 minutos (sai na hora se a Conta Azul não estiver conectada).
DO $$
BEGIN
  PERFORM cron.unschedule('sync-conta-azul') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-conta-azul');
  PERFORM cron.schedule(
    'sync-conta-azul',
    '7,22,37,52 * * * *',
    $cmd$
      SELECT net.http_post(
        url := 'https://project--773e2ce3-3b97-4224-ac14-c22657fc102a.lovable.app/api/public/hooks/sync-conta-azul?token='
               || (SELECT value->>'token' FROM public.cs_settings WHERE key = 'email_inbound'),
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      );
    $cmd$
  );
END $$;

-- Avisos vindos da Conta Azul (nota emitida, nota com falha, venda cancelada).
ALTER TABLE public.notificacoes DROP CONSTRAINT IF EXISTS notificacoes_tipo_check;
ALTER TABLE public.notificacoes ADD CONSTRAINT notificacoes_tipo_check CHECK (tipo IN (
  'mencao', 'ganho_para_faturar', 'pendencia_adm', 'pendencia_respondida',
  'requerimento', 'trainer', 'licenca', 'comissao', 'contrato', 'turma', 'carteira', 'proposta', 'ficha',
  'conta_azul'
));
