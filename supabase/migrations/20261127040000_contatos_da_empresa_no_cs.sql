-- "Tudo é contato": toda pessoa da base (contacts) ligada à empresa de um
-- cliente do CS vira contato do cliente (cs_contacts), com origem 'empresa'.
-- Sem marcar analista_pda: alertas, saúde e cadência continuam iguais, e a
-- jornada de e-mails não escolhe essas pessoas como destinatário sozinha.
ALTER TYPE public.cs_contact_origin ADD VALUE IF NOT EXISTS 'empresa';

CREATE OR REPLACE FUNCTION public.cs_trazer_pessoas_da_empresa(_client_uid text DEFAULT NULL, _contact_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE n integer;
BEGIN
  INSERT INTO cs_contacts (client_uid, nome, email, whatsapp, cargo, contact_id, origem_detecao)
  SELECT DISTINCT ON (k.client_uid, ct.id)
         k.client_uid,
         COALESCE(NULLIF(trim(ct.nome), ''), lower(trim(ct.email)), 'Contato'),
         NULLIF(lower(trim(ct.email)), ''),
         COALESCE(NULLIF(ct.telefone, ''), ct.phones[1]),
         ct.cargo,
         ct.id,
         'empresa'
  FROM cs_clients k
  JOIN contacts ct ON ct.company_id = k.company_id
  WHERE (_client_uid IS NULL OR k.client_uid = _client_uid)
    AND (_contact_id IS NULL OR ct.id = _contact_id)
    AND COALESCE(ct.ativo, true)
    AND NOT EXISTS (
      SELECT 1 FROM cs_contacts c
      WHERE c.client_uid = k.client_uid
        AND (c.contact_id = ct.id
             OR (ct.email IS NOT NULL AND c.email IS NOT NULL AND lower(c.email) = lower(trim(ct.email))))
    );
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.cs_trazer_pessoas_da_empresa(text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.cs_trazer_pessoas_da_empresa(text, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tg_contato_vira_contato_do_cliente()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.company_id IS NOT NULL THEN
    PERFORM public.cs_trazer_pessoas_da_empresa(NULL, NEW.id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS contato_vira_contato_do_cliente ON public.contacts;
CREATE TRIGGER contato_vira_contato_do_cliente
  AFTER INSERT OR UPDATE OF company_id ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.tg_contato_vira_contato_do_cliente();

CREATE OR REPLACE FUNCTION public.tg_cliente_traz_pessoas_da_empresa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.company_id IS NOT NULL THEN
    PERFORM public.cs_trazer_pessoas_da_empresa(NEW.client_uid, NULL);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS cliente_traz_pessoas_da_empresa ON public.cs_clients;
CREATE TRIGGER cliente_traz_pessoas_da_empresa
  AFTER INSERT OR UPDATE OF company_id ON public.cs_clients
  FOR EACH ROW EXECUTE FUNCTION public.tg_cliente_traz_pessoas_da_empresa();

SELECT public.cs_trazer_pessoas_da_empresa();
NOTIFY pgrst, 'reload schema';
