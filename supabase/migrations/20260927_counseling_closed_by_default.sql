-- Do not publish counseling availability until the counselor explicitly enables it.
alter table if exists public.counseling_settings
  alter column weekly_rules set default
  '{"0":{"enabled":false,"start":"10:00","end":"18:00"},"1":{"enabled":false,"start":"10:00","end":"18:00"},"2":{"enabled":false,"start":"10:00","end":"18:00"},"3":{"enabled":false,"start":"10:00","end":"18:00"},"4":{"enabled":false,"start":"10:00","end":"18:00"},"5":{"enabled":false,"start":"10:00","end":"18:00"},"6":{"enabled":false,"start":"10:00","end":"18:00"}}'::jsonb;
