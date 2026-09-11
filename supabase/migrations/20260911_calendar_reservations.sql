create table if not exists public.calendar_reservations (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('learning', 'counseling')),
  source_id text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_type, source_id)
);

create index if not exists calendar_reservations_active_idx
  on public.calendar_reservations (starts_at, ends_at)
  where status = 'active';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'calendar_reservations_no_overlap'
  ) then
    alter table public.calendar_reservations
      add constraint calendar_reservations_no_overlap
      exclude using gist (tstzrange(starts_at, ends_at, '[)') with &&)
      where (status = 'active');
  end if;
end $$;

alter table public.calendar_reservations enable row level security;

-- Access is intentionally limited to Vercel Functions using SUPABASE_SERVICE_ROLE_KEY.
