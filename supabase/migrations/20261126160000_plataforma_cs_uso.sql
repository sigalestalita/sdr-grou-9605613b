-- Uso da plataforma de CS no health score (feedback do treinamento do CS):
-- "Proposta em aberto" (10%) dependia do comercial e quase nunca pontuava;
-- sai, e entra "Uso da plataforma de CS" (10%).
--
-- O uso vem da Plataforma de Sucesso do Cliente (outro Supabase), lido todo
-- dia às 08:10 em Brasília com uma chave de leitura guardada nos segredos do
-- Compass (PLATAFORMA_CS_SERVICE_ROLE_KEY). Cada usuário da plataforma é
-- ligado à empresa pelo e-mail de um contato do cliente ou, sem ele, pelo
-- domínio corporativo do e-mail quando o domínio é de uma empresa só.
CREATE TABLE IF NOT EXISTS public.cs_plataforma_uso (
  client_uid text NOT NULL REFERENCES public.cs_clients(client_uid) ON DELETE CASCADE,
  email text NOT NULL,
  nome text,
  -- 'email' (bateu com um contato) ou 'dominio' (bateu pelo domínio)
  ligado_por text NOT NULL CHECK (ligado_por IN ('email', 'dominio')),
  ultimo_acesso timestamptz,
  aulas_90d integer NOT NULL DEFAULT 0,
  modulos_90d integer NOT NULL DEFAULT 0,
  ultima_atividade timestamptz,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_uid, email)
);

CREATE INDEX IF NOT EXISTS cs_plataforma_uso_atividade_idx
  ON public.cs_plataforma_uso (client_uid, ultima_atividade DESC);

ALTER TABLE public.cs_plataforma_uso ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.cs_plataforma_uso TO authenticated;
GRANT ALL ON public.cs_plataforma_uso TO service_role;
DROP POLICY IF EXISTS "cs_plataforma_uso_read" ON public.cs_plataforma_uso;
CREATE POLICY "cs_plataforma_uso_read" ON public.cs_plataforma_uso
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

-- Troca de peso combinada no treinamento: proposta em aberto 10 → 0,
-- plataforma de CS 0 → 10. Só mexe se a gestão ainda não definiu o novo peso.
UPDATE public.cs_settings
SET value = value || '{"proposta_aberta": 0, "plataforma_cs": 10}'::jsonb,
    updated_at = now()
WHERE key = 'health_weights' AND NOT (value ? 'plataforma_cs');

DO $$
BEGIN
  PERFORM cron.unschedule('sync-plataforma-cs') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-plataforma-cs');
  PERFORM cron.schedule(
    'sync-plataforma-cs',
    '10 11 * * *',
    $cmd$
      SELECT net.http_post(
        url := 'https://project--773e2ce3-3b97-4224-ac14-c22657fc102a.lovable.app/api/public/hooks/sync-plataforma-cs?token='
               || (SELECT value->>'token' FROM public.cs_settings WHERE key = 'email_inbound'),
        headers := '{"Content-Type":"application/json"}'::jsonb,
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      );
    $cmd$
  );
END $$;
