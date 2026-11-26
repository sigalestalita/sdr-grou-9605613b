-- Leads (com telefone) da carteira de um ou mais executivos, para as campanhas
-- de WhatsApp: empresas em que o executivo é o comercial da carteira de CS ou
-- o dono no RD, e leads com ele como dono no RD (mesma regra da "carteira" do
-- e-mail marketing). Devolve um array para não esbarrar no limite de linhas da
-- API; respeita o RLS de quem chama (SECURITY INVOKER).
CREATE OR REPLACE FUNCTION public.leads_da_carteira(_execs uuid[])
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT coalesce(array_agg(l.id ORDER BY l.created_at DESC), '{}')
  FROM leads l
  LEFT JOIN companies co ON co.id = l.company_id
  WHERE l.phone IS NOT NULL
    AND (co.owner_user_id = ANY(_execs)
         OR EXISTS (SELECT 1 FROM cs_clients k
                    WHERE k.company_id = l.company_id AND k.ativo
                      AND k.comercial_responsavel_id = ANY(_execs))
         OR l.rd_owner IN (SELECT p.full_name FROM profiles p WHERE p.id = ANY(_execs)));
$$;

REVOKE ALL ON FUNCTION public.leads_da_carteira(uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.leads_da_carteira(uuid[]) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
