-- Acessos do módulo Administrativo + trainers, e o fim do "escolha seu papel".
--
-- 1. Cadastro público não vira mais Gestão. O papel vinha de
--    raw_user_meta_data, que é o próprio navegador que manda: qualquer
--    e-mail @grougp.com.br se cadastrava como gestão e via tudo — inclusive o
--    faturamento. Agora "gestao" no cadastro é ignorado; quem promove é a
--    administração em Usuários.
-- 2. O módulo Administrativo ganha o tipo de acesso "trainer": a trainer
--    (interna, da Grou) vê e atualiza os requerimentos de serviço dela, mas
--    não o faturamento. Por isso pode_faturar passa a olhar o TIPO de acesso
--    (faturamento | gestao), e não só o time.

CREATE OR REPLACE FUNCTION public.team_access_types(_modulo text)
RETURNS text[]
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE _modulo
    WHEN 'comercial' THEN ARRAY['sdr', 'executivo', 'gestao']
    WHEN 'cs' THEN ARRAY['analista', 'gestao']
    WHEN 'administrativo' THEN ARRAY['faturamento', 'trainer', 'gestao']
    ELSE ARRAY['membro', 'gestao']
  END;
$$;
-- (dado/backfill movido para 20261019150000_dados_e_backfills.sql)

-- trainer vira papel (user_roles), como sdr/executivo/gestao.
CREATE OR REPLACE FUNCTION public.sync_user_roles(_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  DELETE FROM public.user_roles WHERE user_id = _user_id AND role <> 'super_admin';
  INSERT INTO public.user_roles (user_id, role)
  SELECT DISTINCT _user_id, a::public.app_role
    FROM public.user_teams ut, unnest(ut.access) a
   WHERE ut.user_id = _user_id AND a IN ('sdr', 'executivo', 'gestao', 'trainer')
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sync_user_roles(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_user_roles(uuid) TO service_role;

/** Faturamento: gestão, ou time do módulo administrativo com acesso faturamento/gestao. */
CREATE OR REPLACE FUNCTION public.pode_faturar(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_manager(_user_id) OR EXISTS (
    SELECT 1
      FROM public.user_teams ut
      JOIN public.teams t ON t.slug = ut.team
     WHERE ut.user_id = _user_id AND t.ativo AND t.modulo = 'administrativo'
       AND ut.access && ARRAY['faturamento', 'gestao']
  )
$$;
REVOKE EXECUTE ON FUNCTION public.pode_faturar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_faturar(uuid) TO authenticated, service_role;

/** Trainer: papel trainer (ou gestão). */
CREATE OR REPLACE FUNCTION public.e_trainer(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'trainer')
$$;
REVOKE EXECUTE ON FUNCTION public.e_trainer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.e_trainer(uuid) TO authenticated, service_role;

-- As permissões de escrita do ADM passam a exigir o acesso de faturamento.
DROP POLICY IF EXISTS "deals_update_adm" ON public.deals;
CREATE POLICY "deals_update_adm" ON public.deals FOR UPDATE TO authenticated
  USING (public.pode_faturar(auth.uid()));
DROP POLICY IF EXISTS "companies_update_adm" ON public.companies;
CREATE POLICY "companies_update_adm" ON public.companies FOR UPDATE TO authenticated
  USING (public.pode_faturar(auth.uid()));
DROP POLICY IF EXISTS "deal_activities_write" ON public.deal_activities;
CREATE POLICY "deal_activities_write" ON public.deal_activities
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_manager(auth.uid())
    OR public.has_team(auth.uid(), 'comercial')
    OR public.pode_faturar(auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Cadastro sem autopromoção
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  -- Vem do navegador: serve só para escolher o time de entrada, nunca para
  -- dar poder. Gestão, faturamento e trainer são atribuídos em Usuários.
  v_meta_role text := NEW.raw_user_meta_data->>'role';
  v_admin boolean := COALESCE(NEW.raw_app_meta_data->>'admin_created', '') = 'true';
BEGIN
  IF NOT v_admin AND (NEW.email IS NULL OR NEW.email NOT ILIKE '%@grougp.com.br') THEN
    RAISE EXCEPTION 'Apenas emails @grougp.com.br podem se cadastrar nessa plataforma';
  END IF;

  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))
  ON CONFLICT (id) DO NOTHING;

  IF LOWER(NEW.email) = 'talita.sigales@grougp.com.br' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin')
    ON CONFLICT (user_id, role) DO NOTHING;
    RETURN NEW;
  END IF;

  -- contas criadas pela administração recebem os vínculos na sequência
  IF v_admin THEN
    RETURN NEW;
  END IF;

  IF v_meta_role = 'executivo' THEN
    INSERT INTO public.user_teams (user_id, team, access) VALUES (NEW.id, 'comercial', ARRAY['executivo']);
  ELSIF v_meta_role = 'cs' THEN
    INSERT INTO public.user_teams (user_id, team, access) VALUES (NEW.id, 'cs', ARRAY['analista']);
  ELSIF v_meta_role = 'gestao' THEN
    -- pedido de gestão: entra sem time e aguarda a administração
    NULL;
  ELSE
    INSERT INTO public.user_teams (user_id, team, access) VALUES (NEW.id, 'comercial', ARRAY['sdr']);
  END IF;

  RETURN NEW;
END;
$$;
