-- Atendimento do CS no WhatsApp: tickets e a conversa que muda de caixa.
--
-- Até aqui o WhatsApp era território do SDR. Quando quem escreve já é cliente,
-- porém, não há lead para qualificar nem venda para fazer: há um pedido de
-- suporte, e quem responde é o CS responsável pela conta.
--
-- Duas coisas faltavam para isso existir. A conversa não sabia a que área
-- pertence, então não havia como ter duas caixas de entrada sobre a mesma
-- tabela. E não existia ticket: o pedido do cliente virava mensagem solta, sem
-- estado, sem dono e sem como saber o que ficou em aberto.

-- ---------------------------------------------------------------------------
-- 1. A conversa passa a saber de que área é
-- ---------------------------------------------------------------------------
ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS area text NOT NULL DEFAULT 'sdr'
    CHECK (area IN ('sdr', 'cs')),
  ADD COLUMN IF NOT EXISTS client_uid text REFERENCES public.cs_clients(client_uid) ON DELETE SET NULL,
  -- Quando e por que saiu de uma caixa para a outra, para ninguém achar que sumiu.
  ADD COLUMN IF NOT EXISTS area_alterada_em timestamptz,
  ADD COLUMN IF NOT EXISTS area_motivo text;

CREATE INDEX IF NOT EXISTS idx_wa_conv_area
  ON public.whatsapp_conversations (area, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_conv_client
  ON public.whatsapp_conversations (client_uid)
  WHERE client_uid IS NOT NULL;

COMMENT ON COLUMN public.whatsapp_conversations.area IS
  'sdr | cs. Decide em qual caixa de entrada a conversa aparece.';

-- A coluna do contato do CS chama "whatsapp", e guarda o número como a pessoa
-- digitou. Sem a chave normalizada, achar o cliente pelo telefone que a Meta
-- manda é o mesmo problema do lead fantasma: dígitos contra texto formatado.
ALTER TABLE public.cs_contacts
  ADD COLUMN IF NOT EXISTS phone_key text
  GENERATED ALWAYS AS (public.phone_key(whatsapp)) STORED;

CREATE INDEX IF NOT EXISTS idx_cs_contacts_phone_key
  ON public.cs_contacts (phone_key)
  WHERE phone_key IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Tickets
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cs_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero bigserial,
  client_uid text NOT NULL REFERENCES public.cs_clients(client_uid) ON DELETE CASCADE,
  -- De onde veio o pedido. Conversa é o caso comum; o resto entra à mão.
  conversation_id uuid REFERENCES public.whatsapp_conversations(id) ON DELETE SET NULL,
  canal text NOT NULL DEFAULT 'whatsapp'
    CHECK (canal IN ('whatsapp', 'email', 'reuniao', 'telefone', 'manual')),
  titulo text NOT NULL,
  descricao text,
  /*
   * "aguardando_cliente" existe separado de "em_andamento" porque muda de quem
   * é a bola. Sem essa distinção, a fila do analista mistura o que depende dele
   * com o que depende do cliente, e o tempo de resposta fica irreal.
   */
  status text NOT NULL DEFAULT 'aberto'
    CHECK (status IN ('aberto', 'em_andamento', 'aguardando_cliente', 'resolvido', 'cancelado')),
  prioridade text NOT NULL DEFAULT 'normal'
    CHECK (prioridade IN ('baixa', 'normal', 'alta', 'urgente')),
  categoria text,
  responsavel_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  aberto_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Aberto pela IA, e não por gente: conta diferente na métrica.
  aberto_pela_ia boolean NOT NULL DEFAULT false,
  primeira_resposta_em timestamptz,
  resolvido_em timestamptz,
  resolucao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cs_tickets_fila
  ON public.cs_tickets (status, prioridade, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cs_tickets_cliente
  ON public.cs_tickets (client_uid, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cs_tickets_responsavel
  ON public.cs_tickets (responsavel_id, status);

GRANT SELECT, INSERT, UPDATE ON public.cs_tickets TO authenticated;
GRANT ALL ON public.cs_tickets TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.cs_tickets_numero_seq TO authenticated, service_role;
ALTER TABLE public.cs_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cs_tickets_read" ON public.cs_tickets;
CREATE POLICY "cs_tickets_read" ON public.cs_tickets
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "cs_tickets_write" ON public.cs_tickets;
CREATE POLICY "cs_tickets_write" ON public.cs_tickets
  FOR INSERT TO authenticated
  WITH CHECK (public.is_manager(auth.uid()) OR public.has_team(auth.uid(), 'cs'));

DROP POLICY IF EXISTS "cs_tickets_update" ON public.cs_tickets;
CREATE POLICY "cs_tickets_update" ON public.cs_tickets
  FOR UPDATE TO authenticated
  USING (public.is_manager(auth.uid()) OR public.has_team(auth.uid(), 'cs'));

COMMENT ON TABLE public.cs_tickets IS
  'Pedidos de suporte de cliente. Nascem da conversa de WhatsApp ou à mão.';

-- ---------------------------------------------------------------------------
-- 3. Configuração da IA do CS
-- ---------------------------------------------------------------------------
/*
 * Separada da IA do SDR de propósito.
 *
 * As duas conversam por WhatsApp, mas não fazem a mesma coisa: a do SDR
 * qualifica e vende, a do CS resolve. Compartilhar configuração faria uma
 * herdar as ofertas e o objetivo da outra — e a IA do CS oferecendo desconto a
 * um cliente é exatamente o que não pode acontecer.
 */
INSERT INTO public.app_settings (key, value)
SELECT 'cs_ai_agent', jsonb_build_object(
  'enabled', false,
  'autoReplyEnabled', false,
  'objetivo', 'Atender o cliente no WhatsApp: entender o pedido, resolver o que o playbook cobre e abrir ticket para o que precisa de gente.',
  'tom', 'Tom de analista de CS: próximo, direto e resolutivo. Sem formalidade excessiva e sem prometer prazo que não depende de você.',
  'limites', 'Nunca falar de preço, desconto, renovação, upgrade ou condição comercial: isso é do executivo de carteira. Nunca prometer prazo de entrega, correção ou desenvolvimento. Não inventar funcionalidade que não está no playbook.',
  'abrirTicketQuando', 'Abra ticket quando o pedido exigir alguém do time: erro no sistema, dado errado, pedido de configuração, dúvida que o playbook não responde, ou qualquer insatisfação.',
  'assinaturaFallback', 'Equipe Grou'
)
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'cs_ai_agent');
