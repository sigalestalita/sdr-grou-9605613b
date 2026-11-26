-- Tags também nos contatos do cliente (além das tags da empresa): o que cada
-- pessoa já fez com a Grou (masterclass, PDI, ninebox…). Lista simples de
-- rótulos, no mesmo formato das tags da empresa (minúsculas, _ no lugar de
-- espaço).
ALTER TABLE public.cs_contacts
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS cs_contacts_tags_idx ON public.cs_contacts USING gin (tags);
NOTIFY pgrst, 'reload schema';
