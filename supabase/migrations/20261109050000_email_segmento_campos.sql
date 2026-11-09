-- Segmentação por campos do lead, do contato e da empresa, e por empresas
-- escolhidas. Ver catálogo de campos em src/lib/email-marketing/campos.ts.

-- Uma condição de segmentação sobre o valor de um campo (texto).
CREATE OR REPLACE FUNCTION public.email_condicao_ok(v text, op text, alvo text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(CASE op
    WHEN 'vazio' THEN coalesce(trim(v), '') = ''
    WHEN 'preenchido' THEN coalesce(trim(v), '') <> ''
    WHEN 'contem' THEN v ILIKE '%' || alvo || '%'
    WHEN 'nao_contem' THEN coalesce(v, '') NOT ILIKE '%' || alvo || '%'
    WHEN 'igual' THEN lower(trim(v)) = lower(trim(alvo))
    WHEN 'diferente' THEN coalesce(lower(trim(v)), '') <> lower(trim(alvo))
    WHEN 'comeca' THEN v ILIKE alvo || '%'
    WHEN 'maior_igual' THEN trim(v) ~ '^-?[0-9]+([.,][0-9]+)?$' AND trim(alvo) ~ '^-?[0-9]+([.,][0-9]+)?$'
      AND replace(trim(v), ',', '.')::numeric >= replace(trim(alvo), ',', '.')::numeric
    WHEN 'menor_igual' THEN trim(v) ~ '^-?[0-9]+([.,][0-9]+)?$' AND trim(alvo) ~ '^-?[0-9]+([.,][0-9]+)?$'
      AND replace(trim(v), ',', '.')::numeric <= replace(trim(alvo), ',', '.')::numeric
  END, false);
$$;

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
END $$;

-- Valores mais comuns de um campo (sugestões no editor de segmentação).
CREATE OR REPLACE FUNCTION public.email_valores_campo(campo text)
RETURNS TABLE (valor text, total bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
    RAISE EXCEPTION 'não autenticado';
  END IF;
  RETURN QUERY
  SELECT x.v, count(*) FROM (
    SELECT trim(CASE campo
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
         END) AS v
    FROM leads l
    LEFT JOIN contacts ct ON ct.id = l.contact_id
    LEFT JOIN companies co ON co.id = l.company_id
    WHERE l.email IS NOT NULL
  ) x
  WHERE coalesce(x.v, '') <> ''
  GROUP BY x.v ORDER BY count(*) DESC LIMIT 60;
END $$;
REVOKE ALL ON FUNCTION public.email_valores_campo(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.email_valores_campo(text) TO authenticated, service_role;
