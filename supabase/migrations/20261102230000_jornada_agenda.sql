-- Jornada da agenda: um registro por passo enviado (lead, passo, reunião).
-- Gravado antes do envio, para duas rodadas seguidas não mandarem o mesmo passo.
create table if not exists public.sdr_jornada_envios (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  passo text not null,
  reuniao_em timestamptz not null,
  status text not null default 'enviando'
    check (status in ('enviando', 'enviado', 'falhou')),
  erro text,
  message_id uuid,
  enviado_em timestamptz,
  created_at timestamptz not null default now(),
  unique (lead_id, passo, reuniao_em)
);
create index if not exists sdr_jornada_envios_lead_idx on public.sdr_jornada_envios (lead_id);
alter table public.sdr_jornada_envios enable row level security;
drop policy if exists sdr_jornada_envios_read on public.sdr_jornada_envios;
create policy sdr_jornada_envios_read on public.sdr_jornada_envios
  for select to authenticated
  using (public.is_manager(auth.uid()) or public.can_access_lead(lead_id));

-- Começa desligada: liga quando os templates estiverem aprovados na Meta.
insert into public.app_settings (key, value)
values ('sdr_jornada_agenda', '{"ativo": false, "rd_atualizar": false, "templates": {}, "material_url": ""}'::jsonb)
on conflict (key) do nothing;
