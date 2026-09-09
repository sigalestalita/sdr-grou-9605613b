-- Onda 2: a gestão pode gravar no staging do RD (rd_organizations, rd_contacts,
-- rd_deals) com a própria sessão. Permite carregar o espelho de fora do
-- sandbox do Lovable (script local autenticado como gestor), sem chave de
-- serviço e sem publicar o app. Leitura continua aberta a autenticados.
GRANT INSERT, UPDATE ON public.rd_organizations TO authenticated;
GRANT INSERT, UPDATE ON public.rd_contacts TO authenticated;
GRANT INSERT, UPDATE ON public.rd_deals TO authenticated;

DROP POLICY IF EXISTS "rd_orgs_manager_write" ON public.rd_organizations;
CREATE POLICY "rd_orgs_manager_write" ON public.rd_organizations
  FOR ALL TO authenticated
  USING (public.is_manager(auth.uid()))
  WITH CHECK (public.is_manager(auth.uid()));

DROP POLICY IF EXISTS "rd_contacts_manager_write" ON public.rd_contacts;
CREATE POLICY "rd_contacts_manager_write" ON public.rd_contacts
  FOR ALL TO authenticated
  USING (public.is_manager(auth.uid()))
  WITH CHECK (public.is_manager(auth.uid()));

DROP POLICY IF EXISTS "rd_deals_manager_write" ON public.rd_deals;
CREATE POLICY "rd_deals_manager_write" ON public.rd_deals
  FOR ALL TO authenticated
  USING (public.is_manager(auth.uid()))
  WITH CHECK (public.is_manager(auth.uid()));
