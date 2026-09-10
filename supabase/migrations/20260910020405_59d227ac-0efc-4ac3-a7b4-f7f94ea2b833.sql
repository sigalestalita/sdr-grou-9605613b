ALTER FUNCTION public.team_access_types(text) SET search_path = public;
ALTER FUNCTION public.user_teams_validate() SET search_path = public;
ALTER FUNCTION public.leads_stamp_meeting_booked() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.user_teams_sync_roles() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.user_teams_validate() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.leads_stamp_meeting_booked() FROM PUBLIC, anon, authenticated;