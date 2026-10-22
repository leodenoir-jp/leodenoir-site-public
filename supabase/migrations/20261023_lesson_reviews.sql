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
