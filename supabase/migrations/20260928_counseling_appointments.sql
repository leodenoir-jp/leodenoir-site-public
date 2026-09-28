create table if not exists public.counseling_clients (
  id uuid primary key default gen_random_uuid(),
  client_id text not null unique,
  email text not null unique,
  display_name text not null,
  zoom_link text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
alter table public.counseling_appointments enable row level security;
