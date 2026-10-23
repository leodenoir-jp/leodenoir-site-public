alter table public.bookings
  add column if not exists lesson_note text;

alter table public.bookings
  add column if not exists lesson_note_sent_at timestamptz;

drop policy if exists "students can create own booking requests" on public.bookings;

create or replace function public.refresh_learning_remaining_lessons(
  p_student_id uuid,
  p_lesson_kind text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  used_count integer;
  package_row record;
  consumed integer;
begin
  select count(*) into used_count
  from public.bookings
  where student_id = p_student_id
    and lesson_kind = p_lesson_kind
    and status <> 'cancelled';

  for package_row in
    select id, purchased_lessons
    from public.lesson_packages
    where student_id = p_student_id and lesson_kind = p_lesson_kind
    order by purchased_at, id
  loop
    consumed := least(package_row.purchased_lessons, used_count);
    update public.lesson_packages
    set remaining_lessons = package_row.purchased_lessons - consumed
    where id = package_row.id;
    used_count := greatest(0, used_count - consumed);
  end loop;
end;
$$;

revoke all on function public.refresh_learning_remaining_lessons(uuid, text) from public, anon, authenticated;

create or replace function public.sync_learning_booking_balance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
