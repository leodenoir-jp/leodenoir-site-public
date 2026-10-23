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
  lesson_note text,
  lesson_note_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bookings
  add column if not exists lesson_note text;

alter table public.bookings
  add column if not exists lesson_note_sent_at timestamptz;

create or replace function public.refresh_learning_remaining_lessons(p_student_id uuid, p_lesson_kind text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  used_count integer;
  package_row record;
  consumed integer;
begin
  select count(*) into used_count from public.bookings
  where student_id = p_student_id and lesson_kind = p_lesson_kind and status <> 'cancelled';
  for package_row in
    select id, purchased_lessons from public.lesson_packages
    where student_id = p_student_id and lesson_kind = p_lesson_kind order by purchased_at, id
  loop
    consumed := least(package_row.purchased_lessons, used_count);
    update public.lesson_packages set remaining_lessons = package_row.purchased_lessons - consumed where id = package_row.id;
    used_count := greatest(0, used_count - consumed);
  end loop;
end;
$$;

revoke all on function public.refresh_learning_remaining_lessons(uuid, text) from public, anon, authenticated;

create or replace function public.sync_learning_booking_balance()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.refresh_learning_remaining_lessons(old.student_id, old.lesson_kind);
  end if;
  if tg_op in ('UPDATE', 'INSERT') then
    perform public.refresh_learning_remaining_lessons(new.student_id, new.lesson_kind);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists sync_learning_booking_balance on public.bookings;
create trigger sync_learning_booking_balance
after insert or update of status, student_id, lesson_kind or delete on public.bookings
for each row execute function public.sync_learning_booking_balance();

drop trigger if exists sync_learning_package_balance on public.lesson_packages;
create trigger sync_learning_package_balance
after insert on public.lesson_packages
for each row execute function public.sync_learning_booking_balance();

create table if not exists public.availability_slots (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'Asia/Tokyo',
  delivery_mode text not null check (delivery_mode in ('online', 'inPerson')),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.lesson_reviews (
  id uuid primary key default gen_random_uuid(),
  student_name text not null check (char_length(student_name) between 1 and 100),
  student_email text,
  rating integer not null check (rating between 1 and 5),
  comment text not null check (char_length(comment) between 1 and 3000),
  status text not null default 'pending' check (status in ('pending', 'approved')),
  posted_at timestamptz not null default now(),
  approved_at timestamptz
);

create index if not exists lesson_reviews_status_posted_at_idx on public.lesson_reviews(status, posted_at desc);
alter table public.lesson_reviews enable row level security;

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
  unit_price numeric not null check (
    (currency = 'USD' and unit_price between 0 and 100)
    or (currency = 'JPY' and unit_price between 0 and 30000)
  ),
  base_price numeric not null default 0 check (base_price >= 0),
  payment_adjusted_price numeric not null default 0 check (payment_adjusted_price >= 0),
  variable_processing_rate numeric not null default 0 check (variable_processing_rate >= 0 and variable_processing_rate < 1),
  pricing_reference_rate numeric not null default 0 check (pricing_reference_rate >= 0 and pricing_reference_rate < 1),
  final_customer_price numeric not null default 0 check (final_customer_price >= 0),
  total_amount numeric not null check (total_amount >= 0),
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

-- Additive migration for projects created before payment pricing details were introduced.
alter table public.lesson_purchase_offers add column if not exists base_price numeric not null default 0 check (base_price >= 0);
alter table public.lesson_purchase_offers add column if not exists payment_adjusted_price numeric not null default 0 check (payment_adjusted_price >= 0);
alter table public.lesson_purchase_offers add column if not exists variable_processing_rate numeric not null default 0 check (variable_processing_rate >= 0 and variable_processing_rate < 1);
alter table public.lesson_purchase_offers add column if not exists pricing_reference_rate numeric not null default 0 check (pricing_reference_rate >= 0 and pricing_reference_rate < 1);
alter table public.lesson_purchase_offers add column if not exists final_customer_price numeric not null default 0 check (final_customer_price >= 0);

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

-- Booking writes go through /api/learning so calendar occupancy and credits stay in sync.
drop policy if exists "students can create own booking requests" on public.bookings;

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
