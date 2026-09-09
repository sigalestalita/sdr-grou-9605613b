CREATE INDEX IF NOT EXISTS leads_assigned_created_idx
  ON public.leads (assigned_to, created_at DESC);

CREATE INDEX IF NOT EXISTS lead_interactions_lead_type_created_idx
  ON public.lead_interactions (lead_id, type, created_at ASC);

CREATE INDEX IF NOT EXISTS lead_interactions_type_created_lead_idx
  ON public.lead_interactions (type, created_at ASC, lead_id);

CREATE INDEX IF NOT EXISTS cs_clients_active_type_owner_idx
  ON public.cs_clients (tipo_lead, cs_responsavel_id, client_uid)
  WHERE ativo = true;

CREATE INDEX IF NOT EXISTS cs_timeline_occurred_client_idx
  ON public.cs_timeline_events (occurred_at DESC, client_uid);