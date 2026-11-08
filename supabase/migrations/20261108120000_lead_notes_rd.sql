-- Anotações e tarefas do RD dos cards dos funis de SDR vão para o lead
-- (lead_notes). O id do RD evita duplicar quando o histórico roda de novo.
ALTER TABLE public.lead_notes ADD COLUMN IF NOT EXISTS rd_activity_id text;
CREATE UNIQUE INDEX IF NOT EXISTS lead_notes_rd_activity_id_key ON public.lead_notes (rd_activity_id);
