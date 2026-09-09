DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.cs_email_to_timeline()',
    'public.cs_whatsapp_to_timeline()',
    'public.cs_apply_evidence()',
    'public.cs_tasks_guard_manual()',
    'public.cs_cadence_guard_manual()',
    'public.cs_link_calendar_event()',
    'public.cs_unsettle_cancelled_meeting()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.cs_evidence_config() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cs_channel_requires_evidence(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cs_contact_for_phone(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cs_find_evidence(text, text, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cs_settle_meetings() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.cs_evidence_config() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cs_channel_requires_evidence(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cs_contact_for_phone(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cs_find_evidence(text, text, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cs_settle_meetings() TO authenticated, service_role;