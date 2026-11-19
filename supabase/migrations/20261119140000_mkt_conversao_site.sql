-- Porta de entrada dos formulários do site (docs/marketing/arquitetura.md, seções 5 e 6):
-- ativos com chave pública, conversões que nunca são sobrescritas, limite por IP e
-- a marcação do lead que não recebe abertura da IA nem FUP automático.

-- 1) Ativos: o que capta (por enquanto, formulários do site).
CREATE TABLE public.mkt_ativos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  slug text NOT NULL UNIQUE,
  chave text NOT NULL UNIQUE,
  tipo text NOT NULL DEFAULT 'formulario',
  etapa_funil text NOT NULL DEFAULT 'topo' CHECK (etapa_funil IN ('topo', 'meio', 'fundo')),
  regra_passagem text NOT NULL DEFAULT 'sempre'
    CHECK (regra_passagem IN ('nunca', 'sempre', 'por_pontuacao')),
  -- Padrão seguro: lead de ativo não recebe abertura da IA nem FUP automático.
  sem_ia_automatica boolean NOT NULL DEFAULT true,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mkt_ativos_chave_tamanho CHECK (char_length(chave) >= 16)
);
GRANT ALL ON public.mkt_ativos TO service_role;
ALTER TABLE public.mkt_ativos ENABLE ROW LEVEL SECURITY;
-- Sem políticas: só o servidor (service role) lê e grava.
CREATE TRIGGER mkt_ativos_touch BEFORE UPDATE ON public.mkt_ativos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2) Conversões: um registro por envio, nunca sobrescrito.
CREATE TABLE public.mkt_conversoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ativo_id uuid NOT NULL REFERENCES public.mkt_ativos(id) ON DELETE RESTRICT,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  email text NOT NULL,
  nome text,
  telefone text,
  empresa text,
  pagina_url text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  aceita_contato boolean NOT NULL DEFAULT false,
  respostas jsonb NOT NULL DEFAULT '{}'::jsonb,
  origem_tecnica text NOT NULL DEFAULT 'site',
  acao text,
  ip text,
  user_agent text,
  idempotencia text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mkt_conversoes_ativo_email_idx ON public.mkt_conversoes (ativo_id, lower(email), created_at DESC);
CREATE INDEX mkt_conversoes_lead_idx ON public.mkt_conversoes (lead_id);
GRANT ALL ON public.mkt_conversoes TO service_role;
ALTER TABLE public.mkt_conversoes ENABLE ROW LEVEL SECURITY;

-- Nunca sobrescrever: depois de gravada, só dá para ligar ao lead/contato
-- (uma vez) e anotar a ação tomada.
CREATE OR REPLACE FUNCTION public.mkt_conversoes_imutavel()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (to_jsonb(NEW) - 'lead_id' - 'contact_id' - 'acao')
     IS DISTINCT FROM (to_jsonb(OLD) - 'lead_id' - 'contact_id' - 'acao') THEN
    RAISE EXCEPTION 'mkt_conversoes não pode ser alterada';
  END IF;
  IF OLD.lead_id IS NOT NULL AND NEW.lead_id IS DISTINCT FROM OLD.lead_id THEN
    RAISE EXCEPTION 'mkt_conversoes: lead_id já definido';
  END IF;
  IF OLD.contact_id IS NOT NULL AND NEW.contact_id IS DISTINCT FROM OLD.contact_id THEN
    RAISE EXCEPTION 'mkt_conversoes: contact_id já definido';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER mkt_conversoes_imutavel BEFORE UPDATE ON public.mkt_conversoes
  FOR EACH ROW EXECUTE FUNCTION public.mkt_conversoes_imutavel();

-- 3) Limite simples por IP para a rota pública.
CREATE TABLE public.mkt_limite_ip (
  id bigserial PRIMARY KEY,
  ip text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mkt_limite_ip_ip_idx ON public.mkt_limite_ip (ip, created_at DESC);
CREATE INDEX mkt_limite_ip_created_idx ON public.mkt_limite_ip (created_at);
GRANT ALL ON public.mkt_limite_ip TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.mkt_limite_ip_id_seq TO service_role;
ALTER TABLE public.mkt_limite_ip ENABLE ROW LEVEL SECURITY;

-- Conta a tentativa e diz se ainda está dentro do limite.
CREATE OR REPLACE FUNCTION public.mkt_registrar_tentativa(_ip text, _max integer, _janela_min integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('mkt_limite_ip:' || _ip));
  IF random() < 0.05 THEN
    DELETE FROM public.mkt_limite_ip WHERE created_at < now() - interval '1 day';
  END IF;
  SELECT count(*) INTO n FROM public.mkt_limite_ip
   WHERE ip = _ip AND created_at > now() - make_interval(mins => _janela_min);
  IF n >= _max THEN
    RETURN false;
  END IF;
  INSERT INTO public.mkt_limite_ip (ip) VALUES (_ip);
  RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.mkt_registrar_tentativa(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mkt_registrar_tentativa(text, integer, integer) TO service_role;

-- 4) No card do SDR: de qual ativo veio e se fica fora da abertura da IA e dos FUPs automáticos.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS sem_ia_automatica boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mkt_ativo_id uuid REFERENCES public.mkt_ativos(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.leads.sem_ia_automatica IS
  'true: o card não recebe a abertura automática da IA no WhatsApp nem FUP/automação de lead novo.';
CREATE INDEX IF NOT EXISTS leads_mkt_ativo_idx ON public.leads (mkt_ativo_id) WHERE mkt_ativo_id IS NOT NULL;
