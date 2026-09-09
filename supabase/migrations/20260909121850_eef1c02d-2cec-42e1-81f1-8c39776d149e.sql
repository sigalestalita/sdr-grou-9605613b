REVOKE ALL ON FUNCTION public.cs_escalation_config() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cs_escalations() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cs_refresh_escalations() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.cs_escalation_config() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cs_escalations() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cs_refresh_escalations() TO authenticated, service_role;