-- Additive migration. Existing lessons, credits and counseling schedules are unchanged.
begin;
create table if not exists public.tarot_settings (
  id boolean primary key default true check (id),
  settings jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.tarot_requests (
  id uuid primary key,
  client_id uuid not null references public.counseling_clients(id),
  mode text not null check (mode in ('online','in_person','email')),
  status text not null check (status in ('inquiry','pending_payment','intake_pending','awaiting_theme','reading','result_pending','questions','answering','answer_pending','confirmed','complete','expired','cancelled')),
  starts_at timestamptz,
  location jsonb not null default '{}',
  preference text not null default '',
  amount integer not null check (amount >= 0),
  transport_amount integer not null default 0 check (transport_amount >= 0),
  payment_method text check (payment_method in ('PayPal','PayPay')),
  payment_link text,
  paid_at timestamptz,
  theme text,
  theme_received_at timestamptz,
  due_at timestamptz,
  question text,
  question_received_at timestamptz,
  reply_deadline timestamptz,
  question_deadline timestamptz,
  cancellation_reason text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (mode <> 'email' or starts_at is null)
);
create table if not exists public.tarot_mail (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.tarot_requests(id),
  kind text not null,
  recipient text not null,
  subject text not null,
  body text not null,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed')),
  lease_until timestamptz,
  attempted_at timestamptz,
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  unique(request_id, kind)
);
alter table public.tarot_settings enable row level security;
alter table public.tarot_requests enable row level security;
alter table public.tarot_mail enable row level security;
revoke all on public.tarot_settings, public.tarot_requests, public.tarot_mail from anon, authenticated;
grant all on public.tarot_settings, public.tarot_requests, public.tarot_mail to service_role;
create index if not exists tarot_requests_created on public.tarot_requests(created_at desc);
create index if not exists tarot_mail_request on public.tarot_mail(request_id);
alter table public.calendar_reservations drop constraint if exists calendar_reservations_source_type_check;
alter table public.calendar_reservations add constraint calendar_reservations_source_type_check check (source_type in ('learning','counseling','tarot'));

-- All request creation, capacity checks and shared calendar holds commit together.
create or replace function public.tarot_create(p_id uuid, p_email text, p_name text, p_mode text, p_start timestamptz, p_location jsonb, p_preference text, p_inquiry boolean, p_settings jsonb, p_mails jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_client uuid; v_settings jsonb; v_request tarot_requests; v_mail jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('tarot-create'));
  select * into v_request from tarot_requests where id = p_id;
  if found then
    if not exists(select 1 from counseling_clients where id = v_request.client_id and email = p_email) then raise exception 'Invalid request'; end if;
    return p_id;
  end if;
  select settings into v_settings from tarot_settings where id = true for update;
  if v_settings is distinct from p_settings or not coalesce((v_settings->>'enabled')::boolean,false) then raise exception '受付設定が変更されました。再読み込みしてください。'; end if;
  if p_mode not in ('online','in_person','email') or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(p_name) not between 1 and 120 then raise exception 'Invalid request'; end if;
  if (p_inquiry and p_mode <> 'in_person') or (p_mode = 'email' and p_start is not null) then raise exception 'Invalid mode'; end if;
  if (select count(*) from tarot_requests r join counseling_clients c on c.id=r.client_id where c.email=p_email and r.created_at>now()-interval '1 day') >= 5 then raise exception '本日の受付上限に達しています。メールでお問い合わせください。'; end if;
  if p_start is not null and not p_inquiry then
    if p_start < now() + ((v_settings->>'lead_hours')::int * interval '1 hour') then raise exception '開始日時が受付範囲外です。'; end if;
    if (select count(*) from tarot_requests where (starts_at at time zone 'Asia/Tokyo')::date = (p_start at time zone 'Asia/Tokyo')::date and status not in ('cancelled','expired','inquiry')) >= (v_settings->>'daily_limit')::int then raise exception 'この日の受付上限に達しました。'; end if;
  elsif p_mode <> 'email' and not p_inquiry then raise exception '日時を選択してください。'; end if;
  insert into counseling_clients(client_id,email,display_name) values ('TR-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),p_email,p_name)
    on conflict(email) do update set display_name=excluded.display_name,updated_at=now() returning id into v_client;
  insert into tarot_requests(id,client_id,mode,status,starts_at,location,preference,amount)
    values(p_id,v_client,p_mode,case when p_inquiry then 'inquiry' else 'pending_payment' end,case when p_inquiry then null else p_start end,p_location,p_preference,case p_mode when 'online' then 4000 when 'in_person' then 16000 else 3500 end);
  if p_start is not null and not p_inquiry then
    insert into calendar_reservations(source_type,source_id,starts_at,ends_at,status)
      values('tarot',p_id::text,p_start-case when p_mode='in_person' then interval '1 hour' else interval '0' end,p_start+case when p_mode='in_person' then interval '110 minutes' else interval '80 minutes' end,'active');
  end if;
  for v_mail in select * from jsonb_array_elements(p_mails) loop
    insert into tarot_mail(request_id,kind,recipient,subject,body) values(p_id,v_mail->>'kind',v_mail->>'recipient',v_mail->>'subject',v_mail->>'body');
  end loop;
  return p_id;
end $$;

-- Optimistic version prevents double clicks and simultaneous admin transitions.
create or replace function public.tarot_update(p_id uuid, p_version integer, p_patch jsonb, p_mails jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare r tarot_requests; m jsonb; v_settings jsonb; v_start timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext('tarot-create'));
  select * into r from tarot_requests where id=p_id for update;
  if not found or r.version <> p_version then raise exception '情報が更新されました。再読み込みしてください。'; end if;
  if exists(select 1 from tarot_mail where request_id=p_id and status='sending' and lease_until>now()) then raise exception 'メール送信中です。少し待ってください。'; end if;
  if p_patch ? 'starts_at' then
    if r.status <> 'inquiry' or r.mode <> 'in_person' then raise exception '日時を設定できません。'; end if;
    select settings into v_settings from tarot_settings where id=true for update;
    if v_settings is distinct from p_patch->'settings_snapshot' then raise exception '公開枠設定が変更されました。'; end if;
    v_start := (p_patch->>'starts_at')::timestamptz;
    if (select count(*) from tarot_requests where (starts_at at time zone 'Asia/Tokyo')::date=(v_start at time zone 'Asia/Tokyo')::date and status not in ('cancelled','expired','inquiry')) >= (v_settings->>'daily_limit')::int then raise exception 'この日の受付上限に達しました。'; end if;
    insert into calendar_reservations(source_type,source_id,starts_at,ends_at,status) values('tarot',p_id::text,v_start-interval '60 minutes',v_start+interval '110 minutes','active');
  end if;
  update tarot_requests set
    starts_at=coalesce((p_patch->>'starts_at')::timestamptz,starts_at),
    status=coalesce(p_patch->>'status',status),
    payment_method=coalesce(p_patch->>'payment_method',payment_method),
    payment_link=coalesce(p_patch->>'payment_link',payment_link),
    transport_amount=coalesce((p_patch->>'transport_amount')::int,transport_amount),
    paid_at=coalesce((p_patch->>'paid_at')::timestamptz,paid_at),
    theme=coalesce(p_patch->>'theme',theme),
    theme_received_at=coalesce((p_patch->>'theme_received_at')::timestamptz,theme_received_at),
    due_at=coalesce((p_patch->>'due_at')::timestamptz,due_at),
    question=coalesce(p_patch->>'question',question),
    question_received_at=coalesce((p_patch->>'question_received_at')::timestamptz,question_received_at),
    cancellation_reason=coalesce(p_patch->>'cancellation_reason',cancellation_reason),
    version=version+1,updated_at=now() where id=p_id;
  if p_patch ? 'zoom_link' then update counseling_clients set zoom_link=p_patch->>'zoom_link',updated_at=now() where id=r.client_id; end if;
  if p_patch->>'status' in ('cancelled','expired') then
    update calendar_reservations set status='cancelled',updated_at=now() where source_type='tarot' and source_id=p_id::text;
  end if;
  for m in select * from jsonb_array_elements(p_mails) loop
    insert into tarot_mail(request_id,kind,recipient,subject,body) values(p_id,m->>'kind',m->>'recipient',m->>'subject',m->>'body');
  end loop;
end $$;

create or replace function public.tarot_claim_mail(p_id uuid)
returns setof public.tarot_mail language sql security definer set search_path = public as $$
  update tarot_mail set status='sending',lease_until=now()+interval '2 minutes',attempted_at=coalesce(attempted_at,now()),error=null
  where id=p_id and (status in ('pending','failed') or (status='sending' and lease_until<now()))
    and (attempted_at is null or attempted_at>now()-interval '23 hours')
  returning *;
$$;
create or replace function public.tarot_finish_mail(p_id uuid, p_error text default null)
returns void language plpgsql security definer set search_path = public as $$
declare m tarot_mail;
begin
  select * into m from tarot_mail where id=p_id for update;
  if m.status='sent' then return; end if;
  if m.status <> 'sending' then raise exception 'Invalid mail state'; end if;
  update tarot_mail set status=case when p_error is null then 'sent' else 'failed' end,sent_at=case when p_error is null then now() end,error=p_error,lease_until=null where id=p_id;
  if p_error is not null then return; end if;
  if m.kind='intake' then update tarot_requests set status='awaiting_theme',reply_deadline=now()+interval '7 days',version=version+1,updated_at=now() where id=m.request_id and status='intake_pending'; end if;
  if m.kind='result' then update tarot_requests set status='questions',question_deadline=now()+interval '7 days',version=version+1,updated_at=now() where id=m.request_id and status='result_pending'; end if;
  if m.kind='answer' then update tarot_requests set status='complete',version=version+1,updated_at=now() where id=m.request_id and status='answer_pending'; end if;
end $$;

revoke all on function public.tarot_create(uuid,text,text,text,timestamptz,jsonb,text,boolean,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.tarot_update(uuid,integer,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.tarot_claim_mail(uuid) from public,anon,authenticated;
revoke all on function public.tarot_finish_mail(uuid,text) from public,anon,authenticated;
grant execute on function public.tarot_create(uuid,text,text,text,timestamptz,jsonb,text,boolean,jsonb,jsonb) to service_role;
grant execute on function public.tarot_update(uuid,integer,jsonb,jsonb) to service_role;
grant execute on function public.tarot_claim_mail(uuid) to service_role;
grant execute on function public.tarot_finish_mail(uuid,text) to service_role;
notify pgrst, 'reload schema';
commit;
