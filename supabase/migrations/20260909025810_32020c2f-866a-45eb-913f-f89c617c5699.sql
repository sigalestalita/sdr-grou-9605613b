-- Onda 2 · Fundação — Empresa, Contato, Negócio e Ticket como objetos compartilhados
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uid text NOT NULL UNIQUE,
  nome text NOT NULL,
  nome_normalizado text GENERATED ALWAYS AS (lower(regexp_replace(nome, '[^a-zA-Z0-9]+', ' ', 'g'))) STORED,
  tipo_lead public.cs_client_type NOT NULL DEFAULT 'empresa',
  lifecycle text,
  cnpj text,
  dominio text,
  site_url text,
  linkedin_url text,
  telefone text,
  cidade text,
  estado text,
  pais text,
  cep text,
  segmento text,
  porte text,
  num_funcionarios integer,
  fonte_original text,
  indicado_por text,
  pendencia_financeira text,
  sdr_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  parent_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  unidade_codigo text,
  rd_org_id text,
  hubspot_id text,
  owner_original text,
  sdr_original text,
  created_at_original date,
  rfm_seed text,
  analista_pda_declarado boolean NOT NULL DEFAULT false,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  ativo boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS companies_rd_org_id_key ON public.companies (rd_org_id) WHERE rd_org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS companies_cnpj_idx ON public.companies (cnpj) WHERE cnpj IS NOT NULL;
CREATE INDEX IF NOT EXISTS companies_dominio_idx ON public.companies (lower(dominio)) WHERE dominio IS NOT NULL;
CREATE INDEX IF NOT EXISTS companies_nome_norm_idx ON public.companies (nome_normalizado);
CREATE INDEX IF NOT EXISTS companies_parent_idx ON public.companies (parent_company_id);
CREATE INDEX IF NOT EXISTS companies_lifecycle_idx ON public.companies (lifecycle);

CREATE OR REPLACE FUNCTION public.companies_set_uid()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.uid IS NULL OR length(trim(NEW.uid)) = 0 THEN
    LOOP
      NEW.uid := public.cs_gen_client_uid();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.companies WHERE uid = NEW.uid)
           AND NOT EXISTS (SELECT 1 FROM public.cs_clients WHERE client_uid = NEW.uid);
    END LOOP;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS companies_set_uid ON public.companies;
CREATE TRIGGER companies_set_uid BEFORE INSERT ON public.companies FOR EACH ROW EXECUTE FUNCTION public.companies_set_uid();
DROP TRIGGER IF EXISTS companies_touch ON public.companies;
CREATE TRIGGER companies_touch BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  email text,
  emails text[] NOT NULL DEFAULT '{}',
  telefone text,
  phones text[] NOT NULL DEFAULT '{}',
  cargo text,
  departamento text,
  lifecycle text,
  fonte_original text,
  fonte_recente_original text,
  interesse text,
  cidade text,
  estado text,
  linkedin_url text,
  dor_interesse text,
  sdr_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  analista_pda boolean NOT NULL DEFAULT false,
  analista_certificado_em date,
  modulos text[] NOT NULL DEFAULT '{}',
  rd_contact_id text,
  hubspot_id text,
  owner_original text,
  sdr_original text,
  cs_owner_original text,
  created_at_original date,
  last_activity_original date,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  ativo boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS contacts_rd_contact_id_key ON public.contacts (rd_contact_id) WHERE rd_contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS contacts_email_idx ON public.contacts (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS contacts_company_idx ON public.contacts (company_id);
CREATE INDEX IF NOT EXISTS contacts_analista_idx ON public.contacts (company_id) WHERE analista_pda;
DROP TRIGGER IF EXISTS contacts_touch ON public.contacts;
CREATE TRIGGER contacts_touch BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.company_contacts (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  principal boolean NOT NULL DEFAULT false,
  papel text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, contact_id)
);
CREATE INDEX IF NOT EXISTS company_contacts_contact_idx ON public.company_contacts (contact_id);

CREATE TABLE IF NOT EXISTS public.pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  slug text NOT NULL UNIQUE,
  tipo text NOT NULL CHECK (tipo IN ('comercial', 'cs', 'ticket')),
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  nome text NOT NULL,
  slug text NOT NULL,
  ordem integer NOT NULL DEFAULT 0,
  probabilidade integer NOT NULL DEFAULT 0 CHECK (probabilidade BETWEEN 0 AND 100),
  kind text NOT NULL DEFAULT 'open' CHECK (kind IN ('open', 'won', 'lost', 'closed')),
  cor text,
  UNIQUE (pipeline_id, slug)
);
DROP TRIGGER IF EXISTS pipelines_touch ON public.pipelines;
CREATE TRIGGER pipelines_touch BEFORE UPDATE ON public.pipelines FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  categoria text,
  rd_product_id text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  pipeline_id uuid REFERENCES public.pipelines(id) ON DELETE SET NULL,
  stage_id uuid REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost')),
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'BRL',
  closed_at timestamptz,
  created_at_original date,
  closed_at_original date,
  tipo_venda text,
  categoria_venda text,
  temperatura text,
  motivo_venda text,
  lost_reason text,
  lost_note text,
  fonte text,
  fonte_original text,
  campanha text,
  sdr_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  executivo_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  owner_original text,
  reuniao_em timestamptz,
  agendado_em timestamptz,
  status_reuniao text,
  trilha text,
  devolutiva_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  devolutiva_em date,
  observacao_adm text,
  produtos_texto text,
  rd_deal_id text,
  rd_pipeline text,
  rd_stage text,
  hubspot_id text,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS deals_rd_deal_id_key ON public.deals (rd_deal_id) WHERE rd_deal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS deals_company_idx ON public.deals (company_id);
CREATE INDEX IF NOT EXISTS deals_pipeline_stage_idx ON public.deals (pipeline_id, stage_id);
CREATE INDEX IF NOT EXISTS deals_status_idx ON public.deals (status);
DROP TRIGGER IF EXISTS deals_touch ON public.deals;
CREATE TRIGGER deals_touch BEFORE UPDATE ON public.deals FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.deal_contacts (
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  principal boolean NOT NULL DEFAULT false,
  PRIMARY KEY (deal_id, contact_id)
);
CREATE TABLE IF NOT EXISTS public.deal_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  nome text NOT NULL,
  quantidade numeric NOT NULL DEFAULT 1,
  valor_unitario numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS deal_products_deal_idx ON public.deal_products (deal_id);

CREATE TABLE IF NOT EXISTS public.tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero bigserial UNIQUE,
  titulo text NOT NULL,
  descricao text,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  pipeline_id uuid REFERENCES public.pipelines(id) ON DELETE SET NULL,
  stage_id uuid REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  prioridade text NOT NULL DEFAULT 'media' CHECK (prioridade IN ('baixa', 'media', 'alta')),
  categoria text,
  origem text,
  responsavel_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sla_due_at timestamptz,
  resolved_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tickets_company_idx ON public.tickets (company_id);
CREATE INDEX IF NOT EXISTS tickets_stage_idx ON public.tickets (pipeline_id, stage_id);
DROP TRIGGER IF EXISTS tickets_touch ON public.tickets;
CREATE TRIGGER tickets_touch BEFORE UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.ticket_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body text NOT NULL,
  interno boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ticket_comments_ticket_idx ON public.ticket_comments (ticket_id, created_at);

CREATE TABLE IF NOT EXISTS public.dedupe_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('company', 'contact', 'parent')),
  left_id uuid NOT NULL,
  right_id uuid NOT NULL,
  motivo text NOT NULL,
  score numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'merged', 'linked', 'dismissed')),
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, left_id, right_id)
);

ALTER TABLE public.cs_clients ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS cs_clients_company_idx ON public.cs_clients (company_id);
ALTER TABLE public.cs_contacts ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS cs_contacts_contact_idx ON public.cs_contacts (contact_id);

INSERT INTO public.companies (uid, nome, tipo_lead, lifecycle, cnpj, site_url, linkedin_url, segmento, rd_org_id, owner_user_id, created_by, created_at, provenance)
SELECT c.client_uid, c.nome_empresa, c.tipo_lead,
       CASE WHEN c.ativo THEN 'cliente' ELSE 'cliente_inativo' END,
       NULLIF(regexp_replace(COALESCE(c.cnpj, ''), '\D', '', 'g'), ''),
       c.site_url, c.linkedin_url, c.setor, c.rd_org_id, c.comercial_responsavel_id, c.created_by, c.created_at,
       '{"nome":"cs","lifecycle":"cs"}'::jsonb
  FROM public.cs_clients c
 WHERE NOT EXISTS (SELECT 1 FROM public.companies x WHERE x.uid = c.client_uid);

UPDATE public.cs_clients c SET company_id = x.id
  FROM public.companies x
 WHERE x.uid = c.client_uid AND c.company_id IS NULL;

UPDATE public.companies filha SET parent_company_id = mae.id
  FROM public.cs_clients c
  JOIN public.companies mae ON mae.uid = c.parent_client_uid
 WHERE filha.uid = c.client_uid AND c.parent_client_uid IS NOT NULL AND filha.parent_company_id IS NULL;

INSERT INTO public.contacts (nome, email, telefone, cargo, company_id, analista_pda, analista_certificado_em, modulos, rd_contact_id, ativo, created_at, provenance)
SELECT k.nome, k.email, k.whatsapp, k.cargo, c.company_id, k.analista_pda, k.analista_certificado_em,
       k.modulos_vinculados, k.rd_contact_id, k.ativo_no_cliente, k.created_at,
       '{"nome":"cs","email":"cs","telefone":"cs","cargo":"cs"}'::jsonb
  FROM public.cs_contacts k
  JOIN public.cs_clients c ON c.client_uid = k.client_uid
 WHERE k.contact_id IS NULL
   AND (k.rd_contact_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.contacts x WHERE x.rd_contact_id = k.rd_contact_id));

UPDATE public.cs_contacts k SET contact_id = x.id
  FROM public.cs_clients c, public.contacts x
 WHERE c.client_uid = k.client_uid AND k.contact_id IS NULL
   AND x.company_id = c.company_id AND x.nome = k.nome
   AND COALESCE(x.email, '') = COALESCE(k.email, '');

INSERT INTO public.company_contacts (company_id, contact_id, principal)
SELECT x.company_id, x.id, true FROM public.contacts x
 WHERE x.company_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.pipelines (nome, slug, tipo, ordem) VALUES
  ('Novos Negócios', 'novos-negocios', 'comercial', 1),
  ('Indicação', 'indicacao', 'comercial', 2),
  ('CROSS SELL – Cliente', 'cross-sell-cliente', 'comercial', 3),
  ('UP SELL – Recompra', 'up-sell-recompra', 'comercial', 4),
  ('Indique a Grou', 'indique-a-grou', 'comercial', 5),
  ('Atendimento CS', 'atendimento-cs', 'ticket', 10)
ON CONFLICT (slug) DO NOTHING;

WITH p AS (SELECT id, slug FROM public.pipelines)
INSERT INTO public.pipeline_stages (pipeline_id, nome, slug, ordem, probabilidade, kind)
SELECT p.id, s.nome, s.slug, s.ordem, s.prob, s.kind
  FROM p JOIN (VALUES
    ('novos-negocios', 'Agendamento', 'agendamento', 1, 10, 'open'),
    ('novos-negocios', 'Validação dos influenciadores', 'validacao-influenciadores', 2, 20, 'open'),
    ('novos-negocios', 'Validação com o decisor', 'validacao-decisor', 3, 30, 'open'),
    ('novos-negocios', 'Fazer proposta', 'fazer-proposta', 4, 40, 'open'),
    ('novos-negocios', 'Envio de proposta', 'envio-proposta', 5, 50, 'open'),
    ('novos-negocios', 'Em tomada de decisão', 'tomada-decisao', 6, 70, 'open'),
    ('novos-negocios', 'Emissão de OC/Contrato', 'emissao-oc', 7, 90, 'open'),
    ('novos-negocios', 'Venda', 'venda', 8, 100, 'won'),
    ('novos-negocios', 'Perda', 'perda', 9, 0, 'lost'),
    ('indicacao', 'Qualificação', 'qualificacao', 1, 20, 'open'),
    ('indicacao', 'Negociação', 'negociacao', 2, 60, 'open'),
    ('indicacao', 'Venda', 'venda', 3, 100, 'won'),
    ('indicacao', 'Perda', 'perda', 4, 0, 'lost'),
    ('cross-sell-cliente', 'Clientes selecionados', 'clientes-selecionados', 1, 20, 'open'),
    ('cross-sell-cliente', 'Agenda de identificação de necessidade', 'agenda-necessidade', 2, 30, 'open'),
    ('cross-sell-cliente', 'Pesquisa', 'pesquisa', 3, 40, 'open'),
    ('cross-sell-cliente', 'Oportunidade (negócio criado)', 'oportunidade', 4, 60, 'open'),
    ('cross-sell-cliente', 'Avaliação', 'avaliacao', 5, 80, 'open'),
    ('cross-sell-cliente', 'Venda', 'venda', 6, 100, 'won'),
    ('cross-sell-cliente', 'Perda', 'perda', 7, 0, 'lost'),
    ('up-sell-recompra', 'Selecionados', 'selecionados', 1, 30, 'open'),
    ('up-sell-recompra', 'Proposta', 'proposta', 2, 60, 'open'),
    ('up-sell-recompra', 'Venda', 'venda', 3, 100, 'won'),
    ('up-sell-recompra', 'Perda', 'perda', 4, 0, 'lost'),
    ('indique-a-grou', 'Indicado', 'indicado', 1, 20, 'open'),
    ('indique-a-grou', 'Em contato', 'em-contato', 2, 50, 'open'),
    ('indique-a-grou', 'Venda', 'venda', 3, 100, 'won'),
    ('indique-a-grou', 'Perda', 'perda', 4, 0, 'lost'),
    ('atendimento-cs', 'Novo', 'novo', 1, 0, 'open'),
    ('atendimento-cs', 'Em atendimento', 'em-atendimento', 2, 0, 'open'),
    ('atendimento-cs', 'Aguardando cliente', 'aguardando-cliente', 3, 0, 'open'),
    ('atendimento-cs', 'Resolvido', 'resolvido', 4, 100, 'closed')
  ) AS s(pslug, nome, slug, ordem, prob, kind) ON s.pslug = p.slug
ON CONFLICT (pipeline_id, slug) DO NOTHING;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['companies','contacts','company_contacts','pipelines','pipeline_stages','products','deals','deal_contacts','deal_products'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_select" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "%s_select" ON public.%I FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL)', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_write" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "%s_write" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_manager(auth.uid()) OR public.has_team(auth.uid(), ''comercial'') OR public.has_team(auth.uid(), ''cs''))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_update" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "%s_update" ON public.%I FOR UPDATE TO authenticated USING (public.is_manager(auth.uid()) OR public.has_team(auth.uid(), ''comercial'') OR public.has_team(auth.uid(), ''cs''))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_delete" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "%s_delete" ON public.%I FOR DELETE TO authenticated USING (public.is_manager(auth.uid()))', t, t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tickets, public.ticket_comments TO authenticated;
GRANT ALL ON public.tickets, public.ticket_comments TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.tickets_numero_seq TO authenticated;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tickets_all" ON public.tickets;
CREATE POLICY "tickets_all" ON public.tickets FOR ALL TO authenticated
  USING (public.can_access_module(auth.uid(), 'cs') OR public.has_team(auth.uid(), 'comercial'))
  WITH CHECK (public.can_access_module(auth.uid(), 'cs'));
DROP POLICY IF EXISTS "ticket_comments_all" ON public.ticket_comments;
CREATE POLICY "ticket_comments_all" ON public.ticket_comments FOR ALL TO authenticated
  USING (public.can_access_module(auth.uid(), 'cs') OR public.has_team(auth.uid(), 'comercial'))
  WITH CHECK (public.can_access_module(auth.uid(), 'cs'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dedupe_candidates TO authenticated;
GRANT ALL ON public.dedupe_candidates TO service_role;
ALTER TABLE public.dedupe_candidates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dedupe_select" ON public.dedupe_candidates;
CREATE POLICY "dedupe_select" ON public.dedupe_candidates FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "dedupe_write" ON public.dedupe_candidates;
CREATE POLICY "dedupe_write" ON public.dedupe_candidates FOR ALL TO authenticated
  USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));