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

create index if not exists lesson_purchase_offers_student_id_idx
  on public.lesson_purchase_offers(student_id);

create index if not exists lesson_purchase_offers_status_idx
  on public.lesson_purchase_offers(status);

alter table public.lesson_purchase_offers enable row level security;

drop policy if exists "students can read own purchase offers"
  on public.lesson_purchase_offers;

create policy "students can read own purchase offers"
  on public.lesson_purchase_offers for select
  using (
    exists (
      select 1 from public.students
      where students.id = lesson_purchase_offers.student_id
      and students.auth_user_id = auth.uid()
    )
  );
