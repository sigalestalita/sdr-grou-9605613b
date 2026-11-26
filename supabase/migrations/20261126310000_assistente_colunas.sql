-- Assistente: descreve as colunas das tabelas que ela pode consultar (só
-- nomes e tipos; os dados continuam passando pelo RLS de quem pergunta).
CREATE OR REPLACE FUNCTION public.assistente_colunas(_tabelas text[])
RETURNS TABLE (tabela text, coluna text, tipo text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.table_name::text, c.column_name::text, c.data_type::text
  FROM information_schema.columns c
  WHERE auth.uid() IS NOT NULL
    AND c.table_schema = 'public'
    AND c.table_name = ANY(_tabelas)
    AND c.column_name !~* '(token|secret|senha|password|api_key|chave)'
  ORDER BY c.table_name, c.ordinal_position
$$;
REVOKE ALL ON FUNCTION public.assistente_colunas(text[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.assistente_colunas(text[]) TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
