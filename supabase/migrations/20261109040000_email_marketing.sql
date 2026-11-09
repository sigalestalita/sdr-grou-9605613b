-- Módulo de e-mail marketing: segmentações, campanhas, envios (um por
-- destinatário), descadastros e modelos. O envio é feito pelo servidor, em
-- lotes, respeitando o limite diário do provedor (Resend).

-- Descadastros: quem não recebe mais campanhas (vale para todas).
CREATE TABLE IF NOT EXISTS public.email_descadastros (
  email text PRIMARY KEY CHECK (email = lower(email)),
  motivo text,
  origem text NOT NULL DEFAULT 'link' CHECK (origem IN ('link', 'manual', 'bounce', 'reclamacao')),
  campanha_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.email_segmentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL CHECK (char_length(nome) BETWEEN 1 AND 160),
  descricao text,
  regras jsonb NOT NULL DEFAULT '{}'::jsonb,
  ultima_contagem integer,
  contado_em timestamptz,
  criado_por uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.email_modelos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL CHECK (char_length(nome) BETWEEN 1 AND 160),
  assunto text,
  preheader text,
  corpo text NOT NULL DEFAULT '',
  formato text NOT NULL DEFAULT 'texto' CHECK (formato IN ('texto', 'html')),
  criado_por uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.email_campanhas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL CHECK (char_length(nome) BETWEEN 1 AND 160),
  segmento_id uuid REFERENCES public.email_segmentos(id) ON DELETE SET NULL,
  assunto text NOT NULL DEFAULT '',
  preheader text,
  corpo text NOT NULL DEFAULT '',
  formato text NOT NULL DEFAULT 'texto' CHECK (formato IN ('texto', 'html')),
  remetente_nome text NOT NULL DEFAULT 'Grou',
  remetente_email text NOT NULL DEFAULT 'marketing@grougp.com.br'
    CHECK (remetente_email ~* '^[^@\s]+@grougp\.com\.br$'),
  responder_para text,
  status text NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho', 'agendada', 'enviando', 'pausada', 'enviada', 'cancelada')),
  agendada_para timestamptz,
  iniciada_em timestamptz,
  concluida_em timestamptz,
  destinatarios integer NOT NULL DEFAULT 0,
  criado_por uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.email_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id uuid NOT NULL REFERENCES public.email_campanhas(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  email text NOT NULL,
  nome text,
  empresa text,
  token text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', '') UNIQUE,
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'enviado', 'falhou', 'suprimido')),
  resend_id text,
  erro text,
  enviado_em timestamptz,
  aberto_em timestamptz,
  aberturas integer NOT NULL DEFAULT 0,
  clicado_em timestamptz,
  cliques integer NOT NULL DEFAULT 0,
  descadastrou_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campanha_id, email)
);
CREATE INDEX IF NOT EXISTS email_envios_pendentes ON public.email_envios (campanha_id) WHERE status = 'pendente';
CREATE INDEX IF NOT EXISTS email_envios_lead ON public.email_envios (lead_id);
CREATE INDEX IF NOT EXISTS email_envios_enviado ON public.email_envios (enviado_em);

ALTER TABLE public.email_descadastros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_segmentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_modelos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_campanhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_envios ENABLE ROW LEVEL SECURITY;

-- Uso interno: quem está logado lê e cria; envio e rastreio são pelo servidor.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['email_segmentos', 'email_modelos', 'email_campanhas'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_ler ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_ler ON public.%I FOR SELECT TO authenticated USING (true)', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_criar ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_criar ON public.%I FOR INSERT TO authenticated WITH CHECK (true)', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_editar ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_editar ON public.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_apagar ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_apagar ON public.%I FOR DELETE TO authenticated USING (criado_por = auth.uid() OR public.is_manager(auth.uid()))', t, t);
  END LOOP;
END $$;
DROP POLICY IF EXISTS email_envios_ler ON public.email_envios;
CREATE POLICY email_envios_ler ON public.email_envios FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS email_descadastros_ler ON public.email_descadastros;
CREATE POLICY email_descadastros_ler ON public.email_descadastros FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS email_descadastros_manual ON public.email_descadastros;
CREATE POLICY email_descadastros_manual ON public.email_descadastros FOR INSERT TO authenticated WITH CHECK (origem = 'manual');

/*
 * Leads de uma segmentação. Regras (todas opcionais, combinadas com E):
 *   base: "todos" | "kanban" | "marketing"   origens, tipos, etapas (slug),
 *   responsaveis (uuid), prioridades: listas   campanha_contem, conversao_contem,
 *   email_contem: texto   converteu_desde, criado_desde, criado_ate: data
 *   cliente: "sim" | "nao"   sinaleiras: lista
 * Sempre: e-mail válido, fora dos descadastros, um por e-mail.
 * SECURITY DEFINER porque a base de marketing fica escondida pela regra de
 * acesso do kanban; exige usuário logado.
 */
CREATE OR REPLACE FUNCTION public.email_segmento_leads(regras jsonb, limite integer DEFAULT NULL)
RETURNS TABLE (lead_id uuid, email text, nome text, empresa text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r jsonb := coalesce(regras, '{}'::jsonb);
BEGIN
  IF auth.uid() IS NULL AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
    RAISE EXCEPTION 'não autenticado';
  END IF;
  RETURN QUERY
  SELECT DISTINCT ON (lower(trim(l.email))) l.id, lower(trim(l.email)), l.name, l.company_name
  FROM leads l
  LEFT JOIN stages s ON s.id = l.stage_id
  WHERE l.email IS NOT NULL
    AND trim(l.email) ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    AND NOT EXISTS (SELECT 1 FROM email_descadastros d WHERE d.email = lower(trim(l.email)))
    AND (coalesce(r->>'base', 'todos') = 'todos'
         OR (r->>'base' = 'kanban' AND NOT l.oculto_sdr)
         OR (r->>'base' = 'marketing' AND l.oculto_sdr))
    AND (jsonb_array_length(coalesce(r->'origens', '[]')) = 0
         OR l.source::text IN (SELECT jsonb_array_elements_text(r->'origens')))
    AND (jsonb_array_length(coalesce(r->'tipos', '[]')) = 0
         OR l.lead_type::text IN (SELECT jsonb_array_elements_text(r->'tipos')))
    AND (jsonb_array_length(coalesce(r->'etapas', '[]')) = 0
         OR s.slug IN (SELECT jsonb_array_elements_text(r->'etapas')))
    AND (jsonb_array_length(coalesce(r->'prioridades', '[]')) = 0
         OR l.priority::text IN (SELECT jsonb_array_elements_text(r->'prioridades')))
    AND (jsonb_array_length(coalesce(r->'responsaveis', '[]')) = 0
         OR l.assigned_to::text IN (SELECT jsonb_array_elements_text(r->'responsaveis')))
    AND (coalesce(r->>'campanha_contem', '') = '' OR l.campaign ILIKE '%' || (r->>'campanha_contem') || '%')
    AND (coalesce(r->>'email_contem', '') = '' OR l.email ILIKE '%' || (r->>'email_contem') || '%')
    AND (coalesce(r->>'criado_desde', '') = '' OR l.created_at >= (r->>'criado_desde')::date)
    AND (coalesce(r->>'criado_ate', '') = '' OR l.created_at < (r->>'criado_ate')::date + 1)
    AND (coalesce(r->>'conversao_contem', '') = ''
         OR EXISTS (SELECT 1 FROM lead_conversoes c WHERE c.lead_id = l.id
                    AND c.nome ILIKE '%' || (r->>'conversao_contem') || '%'))
    AND (coalesce(r->>'converteu_desde', '') = ''
         OR EXISTS (SELECT 1 FROM lead_conversoes c WHERE c.lead_id = l.id
                    AND c.ocorrida_em >= (r->>'converteu_desde')::date)
         OR l.converted_at >= (r->>'converteu_desde')::date)
    AND (coalesce(r->>'cliente', '') = ''
         OR (r->>'cliente' = 'sim' AND EXISTS (SELECT 1 FROM cs_clients k WHERE k.company_id = l.company_id AND k.ativo))
         OR (r->>'cliente' = 'nao' AND NOT EXISTS (SELECT 1 FROM cs_clients k WHERE k.company_id = l.company_id AND k.ativo)))
    AND (jsonb_array_length(coalesce(r->'sinaleiras', '[]')) = 0
         OR EXISTS (SELECT 1 FROM cs_clients k WHERE k.company_id = l.company_id AND k.ativo
                    AND k.current_signal::text IN (SELECT jsonb_array_elements_text(r->'sinaleiras'))))
  ORDER BY lower(trim(l.email)), l.created_at DESC
  LIMIT limite;
END $$;

CREATE OR REPLACE FUNCTION public.email_segmento_contagem(regras jsonb)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT count(*)::integer FROM public.email_segmento_leads(regras, NULL);
$$;

REVOKE ALL ON FUNCTION public.email_segmento_leads(jsonb, integer) FROM public, anon;
REVOKE ALL ON FUNCTION public.email_segmento_contagem(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.email_segmento_leads(jsonb, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.email_segmento_contagem(jsonb) TO authenticated, service_role;

-- Fila: a cada minuto o servidor envia o próximo lote das campanhas em envio.
DO $$
BEGIN
  PERFORM cron.unschedule('email-campanhas') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'email-campanhas');
  PERFORM cron.schedule('email-campanhas', '* * * * *', $cmd$
    SELECT net.http_post(
      url := 'https://project--773e2ce3-3b97-4224-ac14-c22657fc102a.lovable.app/api/public/hooks/email-campanhas?token='
             || (SELECT value->>'token' FROM public.cs_settings WHERE key = 'email_inbound'),
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{}'::jsonb,
      timeout_milliseconds := 55000
    );
  $cmd$);
END $$;
