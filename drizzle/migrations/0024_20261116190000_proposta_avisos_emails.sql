-- Lista de e-mails que recebem os avisos da proposta (abertura, retorno,
-- todos os slides, aceite, recusa). Vazia: vai para quem enviou a proposta.
ALTER TABLE public.propostas
  ADD COLUMN IF NOT EXISTS avisos_emails text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.propostas.avisos_emails IS
  'E-mails que recebem os avisos da proposta. Vazio: o e-mail do perfil de enviada_por (ou created_by).';
