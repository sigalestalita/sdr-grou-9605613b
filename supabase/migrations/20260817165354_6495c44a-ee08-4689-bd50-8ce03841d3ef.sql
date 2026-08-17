DROP POLICY IF EXISTS wa_camp_manager_write ON public.whatsapp_campaigns;

CREATE POLICY wa_camp_insert ON public.whatsapp_campaigns
FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL AND (created_by = auth.uid() OR public.is_manager(auth.uid())));

CREATE POLICY wa_camp_update ON public.whatsapp_campaigns
FOR UPDATE TO authenticated
USING (public.is_manager(auth.uid()) OR created_by = auth.uid())
WITH CHECK (public.is_manager(auth.uid()) OR created_by = auth.uid());

CREATE POLICY wa_camp_delete ON public.whatsapp_campaigns
FOR DELETE TO authenticated
USING (public.is_manager(auth.uid()) OR created_by = auth.uid());