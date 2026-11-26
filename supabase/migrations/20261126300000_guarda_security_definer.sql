-- Correção de segurança: em função SECURITY DEFINER, current_user é o dono da
-- função (postgres), então o teste "current_user NOT IN ('postgres',
-- 'service_role')" nunca barrava ninguém — qualquer usuário logado podia
-- chamar mesclar_empresas, desativar_empresas etc. direto pela API. A guarda
-- passa a liberar só o service role (auth.role(), do JWT) além de quem a
-- função já aceitava (gestão, time…).
DO $$
DECLARE f record; def text;
BEGIN
  FOR f IN
    SELECT p.oid FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prosrc LIKE '%current_user NOT IN (''postgres'', ''service_role'')%'
  LOOP
    def := pg_get_functiondef(f.oid);
    def := replace(def, 'current_user NOT IN (''postgres'', ''service_role'')',
                        'coalesce(auth.role(), '''') <> ''service_role''');
    EXECUTE def;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
