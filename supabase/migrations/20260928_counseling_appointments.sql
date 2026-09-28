create table if not exists public.counseling_clients (
  id uuid primary key default gen_random_uuid(),
  client_id text not null unique,
  email text not null unique,
  display_name text not null,
  zoom_link text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.counseling_settings (
  id boolean primary key default true check (id),
  timezone text not null default 'Asia/Tokyo',
  lead_hours numeric not null default 18 check (lead_hours >= 0),
  horizon_days integer not null default 14 check (horizon_days between 1 and 120),
  daily_limit integer not null default 3 check (daily_limit between 1 and 30),
  weekly_rules jsonb not null default '{"0":{"enabled":false,"start":"10:00","end":"18:00"},"1":{"enabled":false,"start":"10:00","end":"18:00"},"2":{"enabled":false,"start":"10:00","end":"18:00"},"3":{"enabled":false,"start":"10:00","end":"18:00"},"4":{"enabled":false,"start":"10:00","end":"18:00"},"5":{"enabled":false,"start":"10:00","end":"18:00"},"6":{"enabled":false,"start":"10:00","end":"18:00"}}'::jsonb,
  date_overrides jsonb not null default '[]'::jsonb,
  public_guidance text not null default '',
  provisional_template text not null default '',
  payment_template text not null default '',
  confirmation_template text not null default '',
  reminder_template text not null default '',
  cancellation_template text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.counseling_settings (id)
values (true)
on conflict (id) do nothing;

create table if not exists public.counseling_appointments (
  id uuid primary key default gen_random_uuid(),
  booking_id text not null unique,
  client_id uuid not null references public.counseling_clients(id) on delete restrict,
  starts_at timestamptz not null,
  session_ends_at timestamptz not null,
  reserved_until timestamptz not null,
  timezone text not null default 'Asia/Tokyo',
  status text not null default 'pending_payment' check (status in ('pending_payment', 'confirmed', 'cancelled', 'counselor_cancelled')),
  payment_method text check (payment_method is null or payment_method in ('PayPal', 'PayPay')),
  payment_link text,
  paid_at timestamptz,
  provisional_sent_at timestamptz,
  payment_sent_at timestamptz,
  confirmation_sent_at timestamptz,
  reminder_sent_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists counseling_appointments_starts_at_idx
  on public.counseling_appointments (starts_at);

alter table public.counseling_clients enable row level security;
alter table public.counseling_settings enable row level security;
alter table public.counseling_appointments enable row level security;
