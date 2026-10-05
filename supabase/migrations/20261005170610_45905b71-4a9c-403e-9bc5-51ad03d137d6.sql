-- URL da arte do cabeçalho do template.
--
-- Template criado na Meta com imagem no topo não carrega a arte junto: a Meta
-- exige a mídia como parâmetro de CADA envio, mesmo quando a imagem é sempre a
-- mesma. Sem ela, o disparo volta com #132012 ("parameter format does not
-- match format in the created template"), que é o erro de quem mandou texto
-- onde ela esperava mídia — ou não mandou cabeçalho nenhum.
--
-- Guardar a URL aqui é o que permite o sistema montar o envio certo.

ALTER TABLE public.whatsapp_templates
  ADD COLUMN IF NOT EXISTS header_media_url text;

COMMENT ON COLUMN public.whatsapp_templates.header_media_url IS
  'URL pública da imagem, vídeo ou documento do cabeçalho. Obrigatória para template cujo HEADER na Meta é de mídia.';