-- Imagem do topo de cada campanha de e-mail (URL pública). Sem ela, o e-mail
-- sai com o logo da Grou no topo.
ALTER TABLE public.email_campanhas ADD COLUMN IF NOT EXISTS imagem_topo text;
