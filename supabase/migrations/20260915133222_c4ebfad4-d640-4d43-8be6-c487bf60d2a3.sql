CREATE OR REPLACE FUNCTION public.phone_key(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  WITH d AS (
    SELECT regexp_replace(regexp_replace(COALESCE(raw, ''), '\D', '', 'g'), '^0+', '') AS v
  ),
  nacional AS (
    -- Tira o código do país só quando ele está claramente lá.
    SELECT CASE WHEN length(v) >= 12 AND left(v, 2) = '55' THEN substr(v, 3) ELSE v END AS v
    FROM d
  )
  SELECT CASE
    WHEN length(v) = 0 THEN NULL
    WHEN length(v) BETWEEN 10 AND 11 THEN left(v, 2) || right(v, 8)  -- Brasil: DDD + 8
    WHEN length(v) < 10 OR length(v) > 13 THEN v                      -- curto ou estrangeiro
    ELSE right(v, 8)
  END
  FROM nacional;
$$;

COMMENT ON FUNCTION public.phone_key(text) IS
  'Chave de comparação de telefone: DDD + últimos 8 dígitos. Espelha src/lib/whatsapp/phone.ts.';

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS phone_key text
  GENERATED ALWAYS AS (public.phone_key(phone)) STORED;

ALTER TABLE public.whatsapp_contacts
  ADD COLUMN IF NOT EXISTS phone_key text
  GENERATED ALWAYS AS (public.phone_key(phone)) STORED;

CREATE INDEX IF NOT EXISTS idx_leads_phone_key ON public.leads (phone_key) WHERE phone_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_whatsapp_contacts_phone_key ON public.whatsapp_contacts (phone_key) WHERE phone_key IS NOT NULL;