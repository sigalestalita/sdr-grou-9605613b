REVOKE EXECUTE ON FUNCTION public.cs_can_see_client(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cs_can_see_client(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.cs_can_see_client(text) TO authenticated, service_role;