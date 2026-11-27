-- Segmentação: regras para TIRAR contatos ("os clientes do Maicon, menos a Sicredi").
--
-- As regras de entrada continuam na função de antes (renomeada para email_segmento_base). A email_segmento_leads
-- passa a ser a base menos quem bate em qualquer exclusão — vale para as segmentações por regra e por lista:
--   excluir_empresas  [{id, nome}]  contatos destas empresas
--   excluir_nomes     [texto]       empresa cujo nome contém o texto (ex.: "sicredi" pega todas as cooperativas)
--   excluir_emails    [texto]       e-mail exato, ou domínio ("@sicredi.com.br" / "sicredi.com.br", com subdomínios)
--   excluir_segmentos [uuid]        quem está em outra segmentação salva (sem seguir as exclusões dela)

ALTER FUNCTION public.email_segmento_leads(jsonb, integer) RENAME TO email_segmento_base;
REVOKE ALL ON FUNCTION public.email_segmento_base(jsonb, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_segmento_base(jsonb, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.email_segmento_leads(regras jsonb, limite integer DEFAULT NULL::integer)
 RETURNS TABLE(lead_id uuid, email text, nome text, empresa text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r jsonb := coalesce(regras, '{}'::jsonb);
  emp uuid[] := ARRAY(SELECT (e->>'id')::uuid FROM jsonb_array_elements(coalesce(r->'excluir_empresas', '[]')) e
                      WHERE e->>'id' ~* '^[0-9a-f-]{36}$');
  nomes text[] := ARRAY(SELECT lower(trim(x)) FROM jsonb_array_elements_text(coalesce(r->'excluir_nomes', '[]')) x
                        WHERE length(trim(x)) >= 2);
  emails text[] := ARRAY(SELECT lower(trim(x)) FROM jsonb_array_elements_text(coalesce(r->'excluir_emails', '[]')) x
                         WHERE position('@' in trim(x)) > 1);
  dominios text[] := ARRAY(SELECT lower(ltrim(trim(x), '@')) FROM jsonb_array_elements_text(coalesce(r->'excluir_emails', '[]')) x
                           WHERE position('@' in trim(x)) <= 1 AND length(ltrim(trim(x), '@')) >= 3);
  de_segmentos text[] := '{}';
BEGIN
  IF auth.uid() IS NULL AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
    RAISE EXCEPTION 'não autenticado';
  END IF;
  -- Quem está nas segmentações escolhidas (pelas regras de entrada delas; sem seguir exclusões, para não entrar em ciclo).
  IF jsonb_array_length(coalesce(r->'excluir_segmentos', '[]')) > 0 THEN
    de_segmentos := ARRAY(
      SELECT DISTINCT b.email
      FROM email_segmentos s
      CROSS JOIN LATERAL public.email_segmento_base(s.regras, NULL) b
      WHERE s.id::text IN (SELECT jsonb_array_elements_text(r->'excluir_segmentos')));
  END IF;
  RETURN QUERY
  SELECT b.lead_id, b.email, b.nome, b.empresa
  FROM public.email_segmento_base(r, NULL) b
  LEFT JOIN leads l ON l.id = b.lead_id
  LEFT JOIN companies co ON co.id = l.company_id
  WHERE (cardinality(emp) = 0 OR l.company_id IS NULL OR NOT (l.company_id = ANY (emp)))
    AND (cardinality(nomes) = 0 OR NOT EXISTS (
          SELECT 1 FROM unnest(nomes) n
          WHERE lower(coalesce(co.nome, '')) LIKE '%' || n || '%' OR lower(coalesce(b.empresa, '')) LIKE '%' || n || '%'))
    AND NOT (b.email = ANY (emails))
    AND NOT EXISTS (SELECT 1 FROM unnest(dominios) d
                    WHERE b.email LIKE '%@' || d OR b.email LIKE '%.' || d)
    AND NOT (b.email = ANY (de_segmentos))
  ORDER BY b.email
  LIMIT limite;
END $function$;

REVOKE ALL ON FUNCTION public.email_segmento_leads(jsonb, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.email_segmento_leads(jsonb, integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
