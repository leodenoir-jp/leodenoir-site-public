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

alter table public.students enable row level security;
alter table public.lesson_packages enable row level security;
alter table public.bookings enable row level security;
alter table public.availability_slots enable row level security;

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
