DROP INDEX IF EXISTS public.cs_contacts_rd_contact_id_key;
CREATE UNIQUE INDEX cs_contacts_rd_contact_id_key ON public.cs_contacts (rd_contact_id);

UPDATE public.rd_contacts
SET rd_org_id = raw->>'organization_id'
WHERE rd_org_id IS NULL AND raw->>'organization_id' IS NOT NULL;

UPDATE public.rd_contacts c
SET rd_org_name = o.name
FROM public.rd_organizations o
WHERE c.rd_org_id = o.rd_id AND c.rd_org_name IS NULL;

INSERT INTO public.cs_contacts (client_uid, nome, email, whatsapp, cargo, rd_contact_id, origem_detecao, ativo_no_cliente)
SELECT cl.client_uid, c.name, c.email, c.phone, c.position, c.rd_id, 'manual', true
FROM public.rd_contacts c
JOIN public.cs_clients cl ON cl.rd_org_id = c.rd_org_id
WHERE c.rd_org_id IS NOT NULL
ON CONFLICT (rd_contact_id) DO UPDATE
SET nome = EXCLUDED.nome,
    email = COALESCE(EXCLUDED.email, public.cs_contacts.email),
    whatsapp = COALESCE(EXCLUDED.whatsapp, public.cs_contacts.whatsapp),
    cargo = COALESCE(EXCLUDED.cargo, public.cs_contacts.cargo);