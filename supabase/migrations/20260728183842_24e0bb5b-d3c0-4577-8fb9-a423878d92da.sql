-- 1) Novas colunas
ALTER TABLE public.whatsapp_accounts
  ADD COLUMN IF NOT EXISTS lead_type_scope text[],
  ADD COLUMN IF NOT EXISTS visible_to_user_ids uuid[];

ALTER TABLE public.whatsapp_automation_rules
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.whatsapp_accounts(id) ON DELETE SET NULL;

ALTER TABLE public.whatsapp_fup_sequences
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.whatsapp_accounts(id) ON DELETE SET NULL;

-- 2) Helper: quem pode ver uma conta
CREATE OR REPLACE FUNCTION public.can_view_wa_account(_account_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL AND (
      public.is_manager(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.whatsapp_accounts a
        WHERE a.id = _account_id
          AND (a.visible_to_user_ids IS NULL OR auth.uid() = ANY(a.visible_to_user_ids))
      )
      OR _account_id IS NULL
    )
$$;

-- 3) Atualiza RLS de conversas e mensagens para respeitar visibilidade da conta
DROP POLICY IF EXISTS wa_conv_access ON public.whatsapp_conversations;
CREATE POLICY wa_conv_access ON public.whatsapp_conversations
  FOR ALL TO authenticated
  USING (public.can_access_lead(lead_id) AND public.can_view_wa_account(account_id))
  WITH CHECK (public.can_access_lead(lead_id) AND public.can_view_wa_account(account_id));

DROP POLICY IF EXISTS wa_msg_access ON public.whatsapp_messages;
CREATE POLICY wa_msg_access ON public.whatsapp_messages
  FOR ALL TO authenticated
  USING (
    public.can_access_lead(lead_id)
    AND (
      public.is_manager(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.whatsapp_conversations c
        WHERE c.id = conversation_id AND public.can_view_wa_account(c.account_id)
      )
    )
  )
  WITH CHECK (
    public.can_access_lead(lead_id)
    AND (
      public.is_manager(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.whatsapp_conversations c
        WHERE c.id = conversation_id AND public.can_view_wa_account(c.account_id)
      )
    )
  );

-- 4) Seed: conta consultoria isolada para Mariana Borges + escopo consultoria
UPDATE public.whatsapp_accounts
SET lead_type_scope = ARRAY['consultoria']::text[],
    visible_to_user_ids = ARRAY['81068193-826f-42e8-8670-df87fcdfecf5'::uuid]
WHERE id = 'b86d2571-eed0-4341-8df7-b44e98c9ba91';