-- Só dados (ferramenta de dados do Lovable). Limpa a cadência dos leads que
-- JÁ estão em Agendado ou Desqualificado — o gatilho de 20261019200000 só
-- age nas próximas mudanças de etapa. Idempotente.
UPDATE public.whatsapp_fup_enrollments e
   SET status = 'stopped_stage', completed_at = now(), next_run_at = NULL
  FROM public.leads l JOIN public.stages s ON s.id = l.stage_id
 WHERE e.lead_id = l.id AND e.status = 'active'
   AND s.slug IN ('agendado', 'desqualificado');

UPDATE public.lead_touches t
   SET next_follow_up_at = NULL
  FROM public.leads l JOIN public.stages s ON s.id = l.stage_id
 WHERE t.lead_id = l.id AND t.next_follow_up_at IS NOT NULL AND t.follow_up_done_at IS NULL
   AND s.slug IN ('agendado', 'desqualificado');

UPDATE public.leads l
   SET cadence_status = 'encerrada', next_follow_up_at = NULL
  FROM public.stages s
 WHERE s.id = l.stage_id AND s.slug IN ('agendado', 'desqualificado')
   AND (l.cadence_status <> 'encerrada' OR l.next_follow_up_at IS NOT NULL);
