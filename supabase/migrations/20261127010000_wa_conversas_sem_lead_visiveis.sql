-- Conversas sem lead (número pessoal espelhado: família, colegas, contatos que
-- ainda não são lead) ficavam invisíveis para todos: can_access_lead(NULL) é
-- falso. Agora: com lead, a regra de sempre; sem lead, a gestão, a dona do
-- número e quem está atribuído — não o time todo, porque é o celular de alguém.
CREATE OR REPLACE FUNCTION public.pode_ver_conversa_wa(_lead_id uuid, _account_id uuid, _assigned uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT auth.uid() IS NOT NULL AND CASE
    WHEN _lead_id IS NOT NULL THEN public.can_access_lead(_lead_id) AND public.can_view_wa_account(_account_id)
    ELSE public.is_manager(auth.uid())
      OR _assigned = auth.uid()
      OR EXISTS (SELECT 1 FROM public.whatsapp_accounts a WHERE a.id = _account_id AND a.owner_user_id = auth.uid())
  END
$$;
REVOKE ALL ON FUNCTION public.pode_ver_conversa_wa(uuid, uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pode_ver_conversa_wa(uuid, uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS wa_conv_access ON public.whatsapp_conversations;
CREATE POLICY wa_conv_access ON public.whatsapp_conversations FOR ALL TO authenticated
  USING (public.pode_ver_conversa_wa(lead_id, account_id, assigned_user_id))
  WITH CHECK (public.pode_ver_conversa_wa(lead_id, account_id, assigned_user_id));

DROP POLICY IF EXISTS wa_msg_access ON public.whatsapp_messages;
CREATE POLICY wa_msg_access ON public.whatsapp_messages FOR ALL TO authenticated
  USING (
    (lead_id IS NOT NULL AND public.can_access_lead(lead_id) AND (
      public.is_manager(auth.uid()) OR EXISTS (
        SELECT 1 FROM public.whatsapp_conversations c
        WHERE c.id = whatsapp_messages.conversation_id AND public.can_view_wa_account(c.account_id))))
    OR (lead_id IS NULL AND EXISTS (
        SELECT 1 FROM public.whatsapp_conversations c
        WHERE c.id = whatsapp_messages.conversation_id
          AND public.pode_ver_conversa_wa(c.lead_id, c.account_id, c.assigned_user_id)))
  )
  WITH CHECK (
    (lead_id IS NOT NULL AND public.can_access_lead(lead_id) AND (
      public.is_manager(auth.uid()) OR EXISTS (
        SELECT 1 FROM public.whatsapp_conversations c
        WHERE c.id = whatsapp_messages.conversation_id AND public.can_view_wa_account(c.account_id))))
    OR (lead_id IS NULL AND EXISTS (
        SELECT 1 FROM public.whatsapp_conversations c
        WHERE c.id = whatsapp_messages.conversation_id
          AND public.pode_ver_conversa_wa(c.lead_id, c.account_id, c.assigned_user_id)))
  );
NOTIFY pgrst, 'reload schema';
