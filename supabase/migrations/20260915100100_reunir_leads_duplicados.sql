-- Reúne os leads que o webhook duplicou antes da correção da chave de telefone.
--
-- O sintoma: a pessoa converteu por formulário (lead com e-mail, empresa,
-- etapa), a automação respondeu, e quando ela respondeu de volta no dia
-- seguinte o webhook não achou o lead — porque comparava dígitos contra um
-- telefone formatado — e criou outro, com o nome do perfil do WhatsApp
-- ("Suporte Business - Fulana"), sem e-mail e sem empresa.
--
-- Aqui o lead novo devolve tudo para o original e some. O escopo é estreito de
-- propósito: só o que o próprio webhook criou (source = 'whatsapp_inbound'),
-- só quando não tem e-mail nem negócio — ou seja, só o registro vazio —, e só
-- quando existe um lead mais antigo com o mesmo número. Nenhum dado mais rico
-- é descartado.
--
-- Depende de 20260915100000_telefone_chave.sql (coluna phone_key).

DO $$
DECLARE
  par record;
  fk record;
  v_conv_ok uuid;
  v_conv_dup uuid;
  n_leads int := 0;
  n_msgs int := 0;
BEGIN
  FOR par IN
    SELECT dup.id AS dup_id, dup.name AS dup_nome, keep.id AS keep_id, keep.name AS keep_nome
      FROM public.leads dup
      JOIN LATERAL (
        SELECT l.id, l.name
          FROM public.leads l
         WHERE l.phone_key = dup.phone_key
           AND l.id <> dup.id
           AND l.created_at < dup.created_at
         ORDER BY l.created_at
         LIMIT 1
      ) keep ON true
     WHERE dup.source = 'whatsapp_inbound'
       AND dup.phone_key IS NOT NULL
       AND dup.email IS NULL
       AND dup.deal_id IS NULL
  LOOP
    -- Uma conversa por lead: as mensagens do duplicado entram na conversa que
    -- já existia, senão o inbox quebra ao achar duas para o mesmo lead.
    SELECT id INTO v_conv_ok
      FROM public.whatsapp_conversations
     WHERE lead_id = par.keep_id
     ORDER BY created_at
     LIMIT 1;

    FOR v_conv_dup IN
      SELECT id FROM public.whatsapp_conversations WHERE lead_id = par.dup_id
    LOOP
      IF v_conv_ok IS NULL THEN
        UPDATE public.whatsapp_conversations SET lead_id = par.keep_id WHERE id = v_conv_dup;
        v_conv_ok := v_conv_dup;
      ELSE
        UPDATE public.whatsapp_messages
           SET conversation_id = v_conv_ok, lead_id = par.keep_id
         WHERE conversation_id = v_conv_dup;
        GET DIAGNOSTICS n_msgs = ROW_COUNT;
        DELETE FROM public.whatsapp_conversations WHERE id = v_conv_dup;
      END IF;
    END LOOP;

    -- O resto aponta para leads com ON DELETE CASCADE: sem repontar antes, o
    -- DELETE lá embaixo levaria junto o histórico que acabamos de resgatar.
    -- Percorre as chaves estrangeiras reais em vez de listar tabelas à mão.
    FOR fk IN
      SELECT c.conrelid::regclass AS tabela, a.attname AS coluna
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
       WHERE c.confrelid = 'public.leads'::regclass
         AND c.contype = 'f'
         AND array_length(c.conkey, 1) = 1
    LOOP
      EXECUTE format('UPDATE %s SET %I = $1 WHERE %I = $2', fk.tabela, fk.coluna, fk.coluna)
        USING par.keep_id, par.dup_id;
    END LOOP;

    DELETE FROM public.leads WHERE id = par.dup_id;
    n_leads := n_leads + 1;
    RAISE NOTICE 'Reunido: "%" voltou para "%"', par.dup_nome, par.keep_nome;
  END LOOP;

  RAISE NOTICE 'Leads duplicados reunidos: % (últimas mensagens movidas: %)', n_leads, n_msgs;
END $$;
