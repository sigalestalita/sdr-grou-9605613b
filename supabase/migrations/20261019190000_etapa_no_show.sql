-- Kanban do SDR: etapa "No-show", para a reunião agendada que não aconteceu
-- (o lead não apareceu). Fica entre "Agendado" e "Desqualificado" e não é
-- final: o SDR tenta remarcar e, remarcando, devolve o card para "Agendado".
-- Só dados (ferramenta de dados do Lovable); idempotente.
INSERT INTO public.stages (slug, name, position, color, is_terminal)
SELECT 'no_show', 'No-show', 6, '#f97316', false
 WHERE NOT EXISTS (SELECT 1 FROM public.stages WHERE slug = 'no_show');

UPDATE public.stages SET position = 7 WHERE slug = 'desqualificado' AND position <> 7;
