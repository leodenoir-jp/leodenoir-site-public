create extension if not exists "pgcrypto";

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  student_id text not null unique,
  email text not null unique,
  name text,
  provider text not null default 'email',
  zoom_link text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.students
  add column if not exists zoom_link text;

create table if not exists public.lesson_packages (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  lesson_kind text not null check (lesson_kind in ('japanese', 'english')),
  lesson_menu_id text not null,
  package_label text not null,
  currency text not null check (currency in ('USD', 'JPY')),
  unit_price numeric not null,
  purchased_lessons integer not null check (purchased_lessons > 0),
  remaining_lessons integer not null check (remaining_lessons >= 0),
  purchased_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  lesson_kind text not null check (lesson_kind in ('japanese', 'english')),
  lesson_menu_id text,
  requested_at timestamptz not null default now(),
  requested_slot timestamptz not null,
  timezone text not null default 'Asia/Tokyo',
  status text not null default 'requested',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.availability_slots (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'Asia/Tokyo',
  delivery_mode text not null check (delivery_mode in ('online', 'inPerson')),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.lesson_purchase_offers (
  id uuid primary key default gen_random_uuid(),
  offer_id text not null unique,
  student_id uuid not null references public.students(id) on delete cascade,
  lesson_kind text not null check (lesson_kind in ('japanese', 'english')),
  lesson_menu_id text not null,
  package_label text not null,
  duration_minutes integer not null check (duration_minutes in (25, 50)),
  quantity integer not null check (quantity > 0 and quantity <= 100),
  currency text not null check (currency in ('USD', 'JPY')),
  unit_price numeric not null check (unit_price > 0),
  total_amount numeric not null check (total_amount > 0),
  payment_method text not null check (payment_method in ('PayPal', 'PayPay')),
  payment_link text not null,
  receipt_requested boolean not null default false,
  receipt_name text,
  display_language text not null default 'ja' check (display_language in ('ja', 'en', 'zh-Hant')),
  status text not null default 'pending_payment' check (status in ('pending_payment', 'paid', 'cancelled')),
  offered_at timestamptz not null default now(),
  paid_at timestamptz,
  receipt_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists availability_slots_starts_at_idx on public.availability_slots(starts_at);
create index if not exists lesson_purchase_offers_student_id_idx on public.lesson_purchase_offers(student_id);
create index if not exists lesson_purchase_offers_status_idx on public.lesson_purchase_offers(status);

alter table public.students enable row level security;
alter table public.lesson_packages enable row level security;
alter table public.bookings enable row level security;
alter table public.availability_slots enable row level security;
alter table public.lesson_purchase_offers enable row level security;

create policy "students can read own profile"
  on public.students for select
  using (auth.uid() = auth_user_id);

create policy "students can insert own profile"
  on public.students for insert
  with check (auth.uid() = auth_user_id);

create policy "students can update own profile"
  on public.students for update
  using (auth.uid() = auth_user_id)
  with check (auth.uid() = auth_user_id);

create policy "students can read own packages"
  on public.lesson_packages for select
  using (
    exists (
      select 1 from public.students
      where students.id = lesson_packages.student_id
      and students.auth_user_id = auth.uid()
    )
  );

create policy "students can read own bookings"
  on public.bookings for select
  using (
    exists (
      select 1 from public.students
      where students.id = bookings.student_id
      and students.auth_user_id = auth.uid()
    )
  );

create policy "students can create own booking requests"
  on public.bookings for insert
  with check (
    exists (
      select 1 from public.students
      where students.id = bookings.student_id
      and students.auth_user_id = auth.uid()
    )
  );

create policy "any signed-in student can read availability"
  on public.availability_slots for select
  using (auth.role() = 'authenticated');

create policy "students can read own purchase offers"
  on public.lesson_purchase_offers for select
  using (
    exists (
      select 1 from public.students
      where students.id = lesson_purchase_offers.student_id
      and students.auth_user_id = auth.uid()
    )
  );

-- Shared calendar and counseling reservation foundation.
-- Run this section in the Supabase SQL editor after deploying the related API routes.
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
  weekly_rules jsonb not null default '{"0":{"enabled":false,"start":"10:00","end":"18:00"},"1":{"enabled":true,"start":"10:00","end":"18:00"},"2":{"enabled":true,"start":"10:00","end":"18:00"},"3":{"enabled":true,"start":"10:00","end":"18:00"},"4":{"enabled":true,"start":"10:00","end":"18:00"},"5":{"enabled":true,"start":"10:00","end":"18:00"},"6":{"enabled":false,"start":"10:00","end":"18:00"}}'::jsonb,
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

create index if not exists counseling_appointments_starts_at_idx
  on public.counseling_appointments (starts_at);

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

alter table public.counseling_clients enable row level security;
alter table public.counseling_settings enable row level security;
alter table public.counseling_appointments enable row level security;
alter table public.calendar_reservations enable row level security;

-- These tables are accessed only by Vercel Functions with SUPABASE_SERVICE_ROLE_KEY.
-- No public policies are intentionally created.
