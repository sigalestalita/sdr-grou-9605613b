-- Times / áreas cadastráveis e tipos de acesso por pessoa em cada time.
--
-- Antes: times eram um enum fixo (comercial, cs) e cada pessoa tinha um único
-- papel (sdr, executivo, gestao, super_admin). Agora:
--
--   * public.teams        — cadastro de times/áreas (nome, descrição, cor e o
--                           módulo do sistema que o time habilita: comercial ou cs;
--                           uma área de apoio pode não habilitar módulo nenhum).
--   * public.user_teams   — vínculo pessoa × time com os TIPOS DE ACESSO dela
--                           naquele time (access text[]):
--                             comercial → sdr | executivo | gestao
--                             cs        → analista | gestao
--                             sem módulo→ membro | gestao
--   * public.user_roles   — continua existindo (has_role, is_manager e as RLS
--                           dependem dela), mas passa a ser DERIVADA dos vínculos
--                           por trigger. super_admin é a exceção: é marcado por
--                           pessoa e nunca é recalculado.
--
-- Exemplo pedido: uma analista de CS que também é executiva comercial fica em
-- "Customer Success" (analista) e em "Comercial" (executivo) — sem "sdr", ela
-- não vê o módulo SDR.

-- ---------------------------------------------------------------------------
-- 1. Cadastro de times / áreas
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.teams (
  slug text PRIMARY KEY,
  nome text NOT NULL,
  descricao text,
  -- módulo do sistema que o time habilita (NULL = área de apoio, sem módulo)
  modulo text CHECK (modulo IN ('comercial', 'cs')),
  cor text NOT NULL DEFAULT 'slate',
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
GRANT SELECT ON public.teams TO authenticated;
GRANT ALL ON public.teams TO service_role;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "teams_read" ON public.teams;
CREATE POLICY "teams_read" ON public.teams FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "teams_manager_write" ON public.teams;
CREATE POLICY "teams_manager_write" ON public.teams FOR ALL TO authenticated
  USING (public.is_manager(auth.uid())) WITH CHECK (public.is_manager(auth.uid()));

INSERT INTO public.teams (slug, nome, descricao, modulo, cor, ordem) VALUES
  ('comercial', 'Comercial', 'Pré-vendas (SDR) e executivos comerciais: pipeline de leads, inbox, cadência e carteira fechada', 'comercial', 'sky', 10),
  ('cs', 'Customer Success', 'Carteira de clientes, sinaleira, cadência semanal, tarefas e alertas', 'cs', 'emerald', 20)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Vínculo pessoa × time: slug livre + tipos de acesso
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_teams ALTER COLUMN team TYPE text USING team::text;
ALTER TABLE public.user_teams ADD COLUMN IF NOT EXISTS access text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.user_teams ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.user_teams DROP CONSTRAINT IF EXISTS user_teams_team_fkey;
ALTER TABLE public.user_teams
  ADD CONSTRAINT user_teams_team_fkey FOREIGN KEY (team) REFERENCES public.teams(slug)
  ON UPDATE CASCADE ON DELETE CASCADE;

/** Tipos de acesso válidos para o módulo do time. */
CREATE OR REPLACE FUNCTION public.team_access_types(_modulo text)
RETURNS text[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE _modulo
    WHEN 'comercial' THEN ARRAY['sdr', 'executivo', 'gestao']
    WHEN 'cs' THEN ARRAY['analista', 'gestao']
    ELSE ARRAY['membro', 'gestao']
  END;
$$;

CREATE OR REPLACE FUNCTION public.user_teams_validate()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_modulo text;
  v_allowed text[];
  v_bad text;
BEGIN
  SELECT modulo INTO v_modulo FROM public.teams WHERE slug = NEW.team;
  v_allowed := public.team_access_types(v_modulo);
  IF NEW.access IS NULL OR array_length(NEW.access, 1) IS NULL THEN
    RAISE EXCEPTION 'Informe ao menos um tipo de acesso no time %', NEW.team;
  END IF;
  SELECT a INTO v_bad FROM unnest(NEW.access) a WHERE NOT (a = ANY (v_allowed)) LIMIT 1;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Tipo de acesso "%" não vale para o time % (aceitos: %)', v_bad, NEW.team, array_to_string(v_allowed, ', ');
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Backfill: tipos de acesso a partir do papel atual
-- ---------------------------------------------------------------------------
WITH r AS (
  SELECT user_id, array_agg(role::text) AS roles FROM public.user_roles GROUP BY user_id
)
UPDATE public.user_teams ut
   SET access = CASE ut.team
     WHEN 'comercial' THEN COALESCE(NULLIF(ARRAY_REMOVE(ARRAY[
         CASE WHEN 'sdr' = ANY (r.roles) THEN 'sdr' END,
         CASE WHEN 'executivo' = ANY (r.roles) THEN 'executivo' END,
         CASE WHEN 'gestao' = ANY (r.roles) OR 'super_admin' = ANY (r.roles) THEN 'gestao' END
       ], NULL), '{}'), ARRAY['sdr'])
     WHEN 'cs' THEN CASE WHEN 'gestao' = ANY (r.roles) OR 'super_admin' = ANY (r.roles)
                         THEN ARRAY['gestao'] ELSE ARRAY['analista'] END
     ELSE ARRAY['membro']
   END
  FROM r
 WHERE r.user_id = ut.user_id
   AND (ut.access IS NULL OR array_length(ut.access, 1) IS NULL);

-- quem ficou sem tipo (sem papel nenhum)
UPDATE public.user_teams SET access = CASE team WHEN 'cs' THEN ARRAY['analista'] ELSE ARRAY['sdr'] END
 WHERE array_length(access, 1) IS NULL;

-- quem tem papel mas não está em time nenhum
INSERT INTO public.user_teams AS ut0 (user_id, team, access)
SELECT ur.user_id, 'comercial', ARRAY[ur.role::text]
  FROM public.user_roles ur
 WHERE ur.role IN ('sdr', 'executivo')
   AND NOT EXISTS (SELECT 1 FROM public.user_teams ut WHERE ut.user_id = ur.user_id)
ON CONFLICT (user_id, team) DO UPDATE
  SET access = ARRAY(SELECT DISTINCT a FROM unnest(ut0.access || EXCLUDED.access) a);

INSERT INTO public.user_teams (user_id, team, access)
SELECT ur.user_id, t.slug, ARRAY['gestao']
  FROM public.user_roles ur
  CROSS JOIN (VALUES ('comercial'), ('cs')) AS t(slug)
 WHERE ur.role = 'gestao'
   AND NOT EXISTS (SELECT 1 FROM public.user_teams ut WHERE ut.user_id = ur.user_id)
ON CONFLICT (user_id, team) DO NOTHING;

DROP TRIGGER IF EXISTS user_teams_validate ON public.user_teams;
CREATE TRIGGER user_teams_validate
  BEFORE INSERT OR UPDATE ON public.user_teams
  FOR EACH ROW EXECUTE FUNCTION public.user_teams_validate();

-- ---------------------------------------------------------------------------
-- 4. Papéis derivados dos vínculos (super_admin preservado)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_user_roles(_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  DELETE FROM public.user_roles WHERE user_id = _user_id AND role <> 'super_admin';
  INSERT INTO public.user_roles (user_id, role)
  SELECT DISTINCT _user_id, a::public.app_role
    FROM public.user_teams ut, unnest(ut.access) a
   WHERE ut.user_id = _user_id AND a IN ('sdr', 'executivo', 'gestao')
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sync_user_roles(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_user_roles(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.user_teams_sync_roles()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_user_roles(COALESCE(NEW.user_id, OLD.user_id));
  IF TG_OP = 'UPDATE' AND NEW.user_id <> OLD.user_id THEN
    PERFORM public.sync_user_roles(OLD.user_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS user_teams_sync_roles ON public.user_teams;
CREATE TRIGGER user_teams_sync_roles
  AFTER INSERT OR UPDATE OR DELETE ON public.user_teams
  FOR EACH ROW EXECUTE FUNCTION public.user_teams_sync_roles();

-- recalcula todo mundo que tem vínculo (quem não tem, mantém o que era)
DO $$
DECLARE u uuid;
BEGIN
  FOR u IN SELECT DISTINCT user_id FROM public.user_teams LOOP
    PERFORM public.sync_user_roles(u);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 5. has_team passa a olhar o MÓDULO do time (times novos do CS contam como CS)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_team(_user_id uuid, _team public.app_team)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.user_teams ut
      JOIN public.teams t ON t.slug = ut.team
     WHERE ut.user_id = _user_id AND t.ativo AND t.modulo = _team::text
  )
$$;

-- ---------------------------------------------------------------------------
-- 6. Cadastro: o papel escolhido no login vira vínculo no time Comercial/CS.
--    Contas criadas pela administração (app_metadata.admin_created, que só o
--    service role consegue gravar) podem ser de outro domínio.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
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
  ELSIF v_meta_role = 'gestao' THEN
    INSERT INTO public.user_teams (user_id, team, access) VALUES
      (NEW.id, 'comercial', ARRAY['gestao']), (NEW.id, 'cs', ARRAY['gestao']);
  ELSIF v_meta_role = 'cs' THEN
    INSERT INTO public.user_teams (user_id, team, access) VALUES (NEW.id, 'cs', ARRAY['analista']);
  ELSE
    INSERT INTO public.user_teams (user_id, team, access) VALUES (NEW.id, 'comercial', ARRAY['sdr']);
  END IF;

  RETURN NEW;
END;
$$;
