-- Service-role-only atomic replacement. No paid packages, bookings, or emails.
alter table public.calendar_reservations
  add column if not exists owner_student_id uuid references public.students(id) on delete set null;

create table if not exists public.calendar_sync_state (
  source text primary key,
  fetched_at timestamptz not null,
  window_start timestamptz not null,
  window_end timestamptz not null,
  block_count integer not null,
  updated_at timestamptz not null default now()
);
alter table public.calendar_sync_state enable row level security;
revoke all on public.calendar_sync_state from anon, authenticated;

create or replace function public.sync_outlook_at_busy(
  p_start timestamptz, p_end timestamptz, p_fetched timestamptz, p_blocks jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  owner_id uuid;
  block jsonb;
  a timestamptz;
  b timestamptz;
  previous_end timestamptz;
  old_count integer;
  new_count integer;
  result jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('outlook-at-sync'));
  if p_start is null or p_end is null or p_fetched is null or p_blocks is null
    or p_end <= p_start or p_end - p_start > interval '93 days'
    or p_start < now() - interval '1 day' or p_start > now() + interval '1 day'
    or abs(extract(epoch from now() - p_fetched)) > 3600
    or jsonb_typeof(p_blocks) <> 'array' then
    raise exception 'Invalid snapshot' using errcode = '22023';
  end if;
  if exists(select 1 from calendar_sync_state where source = 'outlook-at' and fetched_at > p_fetched) then
    raise exception 'Stale snapshot' using errcode = '22023';
  end if;
  new_count := jsonb_array_length(p_blocks);
  if new_count > 5000 then raise exception 'Too many blocks' using errcode = '22023'; end if;
  for block in select value from jsonb_array_elements(p_blocks) loop
    a := (block->>'start')::timestamptz; b := (block->>'end')::timestamptz;
    if a is null or b is null or b <= a or a < p_start or b > p_end
      or (previous_end is not null and a <= previous_end) then
      raise exception 'Invalid block order or range' using errcode = '22023';
    end if;
    previous_end := b;
  end loop;
  select count(*) into old_count from calendar_reservations
    where source_type = 'learning' and source_id like 'OUTLOOK-AT:%' and status = 'active'
    and starts_at < p_end and ends_at > p_start;
  if old_count >= 4 and new_count < old_count / 2.0 then
    raise exception 'Large decrease requires manual review' using errcode = 'P0001';
  end if;
  select id into owner_id from students where lower(email) = 'yusamiyoyo003@gmail.com';
  if owner_id is null then
    insert into students(student_id, email, name, provider)
      values('OPS-AT', 'yusamiyoyo003@gmail.com', 'Operations calendar', 'email') returning id into owner_id;
  end if;
  update calendar_reservations set status = 'cancelled', updated_at = now()
    where source_type = 'learning' and source_id like 'OUTLOOK-AT:%' and status = 'active'
    and starts_at < p_end and ends_at > p_start;
  for block in select value from jsonb_array_elements(p_blocks) loop
    a := (block->>'start')::timestamptz; b := (block->>'end')::timestamptz;
    insert into calendar_reservations(source_type, source_id, starts_at, ends_at, status, owner_student_id)
      values('learning', 'OUTLOOK-AT:' || md5(extract(epoch from a)::text || ':' || extract(epoch from b)::text), a, b, 'active', owner_id)
      on conflict(source_type, source_id) do update set
        starts_at = excluded.starts_at, ends_at = excluded.ends_at, status = 'active',
        owner_student_id = excluded.owner_student_id, updated_at = now();
  end loop;
  insert into calendar_sync_state(source, fetched_at, window_start, window_end, block_count)
    values('outlook-at', p_fetched, p_start, p_end, new_count)
    on conflict(source) do update set fetched_at = excluded.fetched_at, window_start = excluded.window_start,
      window_end = excluded.window_end, block_count = excluded.block_count, updated_at = now();
  result := jsonb_build_object('blockCount', new_count, 'syncedAt', now());
  return result;
end;
$$;
revoke all on function public.sync_outlook_at_busy(timestamptz, timestamptz, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.sync_outlook_at_busy(timestamptz, timestamptz, timestamptz, jsonb) to service_role;
