ALTER FUNCTION public.phone_key(text) SET search_path = public;

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