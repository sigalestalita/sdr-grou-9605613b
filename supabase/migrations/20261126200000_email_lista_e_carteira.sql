-- E-mail marketing: (1) segmentação por LISTA subida (planilha ou colagem),
-- para disparar para uma lista pronta; (2) regra "carteira" — os clientes de
-- um executivo (carteira de CS ou dono no RD), que quase nunca têm o executivo
-- como responsável do lead no Compass (por isso "os clientes do Maicon não
-- aparecem" filtrando por Responsáveis).
CREATE TABLE IF NOT EXISTS public.email_segmento_membros (
  segmento_id uuid NOT NULL REFERENCES public.email_segmentos(id) ON DELETE CASCADE,
  -- sempre em minúsculas e sem espaços (quem sobe a lista já normaliza)
  email text NOT NULL CHECK (email = lower(trim(email)) AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  nome text,
  empresa text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (segmento_id, email)
);

ALTER TABLE public.email_segmento_membros ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_segmento_membros TO authenticated;
GRANT ALL ON public.email_segmento_membros TO service_role;
DROP POLICY IF EXISTS email_segmento_membros_all ON public.email_segmento_membros;
CREATE POLICY email_segmento_membros_all ON public.email_segmento_membros
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.email_segmento_leads(regras jsonb, limite integer DEFAULT NULL::integer)
 RETURNS TABLE(lead_id uuid, email text, nome text, empresa text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r jsonb := coalesce(regras, '{}'::jsonb);
BEGIN
  IF auth.uid() IS NULL AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
    RAISE EXCEPTION 'não autenticado';
  END IF;
  -- Lista subida (planilha/colagem): os e-mails da lista, sem descadastrados,
  -- ligados ao lead de mesmo e-mail quando existe.
  IF coalesce(r->>'lista', '') <> '' THEN
    RETURN QUERY
    SELECT l.id, m.email, coalesce(m.nome, l.name), coalesce(m.empresa, l.company_name)
    FROM email_segmento_membros m
    LEFT JOIN leads l ON lower(l.email) = m.email
    WHERE m.segmento_id = (r->>'lista')::uuid
      AND NOT EXISTS (SELECT 1 FROM email_descadastros d WHERE d.email = m.email)
    ORDER BY m.email
    LIMIT limite;
    RETURN;
  END IF;
  RETURN QUERY
  SELECT DISTINCT ON (lower(trim(l.email))) l.id, lower(trim(l.email)), l.name, l.company_name
  FROM leads l
  LEFT JOIN stages s ON s.id = l.stage_id
  LEFT JOIN contacts ct ON ct.id = l.contact_id
  LEFT JOIN companies co ON co.id = l.company_id
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
    -- Carteira: empresas em que a pessoa é o executivo comercial (carteira de
    -- CS) ou a dona no RD, e leads com ela como dona no RD. Os clientes do
    -- executivo quase nunca têm ele como responsável do lead no Compass.
    AND (jsonb_array_length(coalesce(r->'carteiras', '[]')) = 0
         OR EXISTS (SELECT 1 FROM cs_clients k WHERE k.company_id = l.company_id AND k.ativo
                    AND k.comercial_responsavel_id::text IN (SELECT jsonb_array_elements_text(r->'carteiras')))
         OR co.owner_user_id::text IN (SELECT jsonb_array_elements_text(r->'carteiras'))
         OR l.rd_owner IN (SELECT p.full_name FROM profiles p
                           WHERE p.id::text IN (SELECT jsonb_array_elements_text(r->'carteiras'))))
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
    AND (jsonb_array_length(coalesce(r->'empresas', '[]')) = 0
         OR l.company_id::text IN (SELECT e->>'id' FROM jsonb_array_elements(r->'empresas') e))
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(coalesce(r->'condicoes', '[]')) c
      WHERE NOT public.email_condicao_ok(
        CASE c->>'campo'
           WHEN 'nome' THEN l.name
           WHEN 'email' THEN l.email
           WHEN 'telefone' THEN l.phone
           WHEN 'cargo' THEN l.position
           WHEN 'empresa_lead' THEN l.company_name
           WHEN 'segmento' THEN l.company_segment
           WHEN 'porte' THEN l.company_size
           WHEN 'localizacao' THEN l.company_location
           WHEN 'site' THEN l.company_website
           WHEN 'origem' THEN l.source
           WHEN 'canal' THEN l.channel
           WHEN 'campanha' THEN l.campaign
           WHEN 'anuncio' THEN l.ad_name
           WHEN 'formulario' THEN l.form_name
           WHEN 'tipo' THEN l.lead_type::text
           WHEN 'prioridade' THEN l.priority::text
           WHEN 'score' THEN l.score::text
           WHEN 'motivo_perda' THEN l.lost_reason
           WHEN 'demo_free' THEN l.demo_free::text
           WHEN 'dono_rd' THEN l.rd_owner
           WHEN 'contato_cargo' THEN ct.cargo
           WHEN 'departamento' THEN ct.departamento
           WHEN 'contato_cidade' THEN ct.cidade
           WHEN 'contato_estado' THEN ct.estado
           WHEN 'ciclo_vida' THEN ct.lifecycle
           WHEN 'interesse' THEN ct.interesse
           WHEN 'dor' THEN ct.dor_interesse
           WHEN 'analista_pda' THEN ct.analista_pda::text
           WHEN 'empresa_nome' THEN co.nome
           WHEN 'empresa_segmento' THEN co.segmento
           WHEN 'empresa_porte' THEN co.porte
           WHEN 'empresa_cidade' THEN co.cidade
           WHEN 'empresa_estado' THEN co.estado
           WHEN 'empresa_funcionarios' THEN co.num_funcionarios::text
           WHEN 'empresa_dominio' THEN co.dominio
           WHEN 'empresa_ciclo' THEN co.lifecycle
         END,
        c->>'operador', c->>'valor'))
  ORDER BY lower(trim(l.email)), l.created_at DESC
  LIMIT limite;
END $function$;


NOTIFY pgrst, 'reload schema';
