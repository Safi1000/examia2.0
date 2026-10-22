-- Phone notifications (web push), kept quiet on purpose.
--
--   push_subscriptions  one row per device a student allowed notifications on
--   notify_prefs        which kinds a student wants (all on by default)
--   notify_log          what was sent, so nothing is ever sent twice and the
--                       daily cap can be enforced
--
-- Sending happens only on the server (service role), from
-- app/api/notify/released and app/api/cron/notify.

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_student_idx on public.push_subscriptions (student_id);

create table if not exists public.notify_prefs (
  student_id  uuid primary key references public.students(id) on delete cascade,
  results     boolean not null default true,
  tests       boolean not null default true,
  assignments boolean not null default true,
  updated_at  timestamptz not null default now()
);

create table if not exists public.notify_log (
  student_id uuid not null references public.students(id) on delete cascade,
  kind       text not null,
  ref        text not null,
  sent_at    timestamptz not null default now(),
  primary key (student_id, kind, ref)
);
create index if not exists notify_log_sent_idx on public.notify_log (student_id, sent_at desc);

alter table public.push_subscriptions enable row level security;
alter table public.notify_prefs enable row level security;
alter table public.notify_log enable row level security;

-- A student manages only their own devices and preferences.
drop policy if exists push_subs_own on public.push_subscriptions;
create policy push_subs_own on public.push_subscriptions for all to authenticated
  using (student_id = public.current_student_id())
  with check (student_id = public.current_student_id());

drop policy if exists notify_prefs_own on public.notify_prefs;
create policy notify_prefs_own on public.notify_prefs for all to authenticated
  using (student_id = public.current_student_id() or public.is_admin())
  with check (student_id = public.current_student_id());

-- The log is server-only (service role bypasses RLS); no policies for users.
revoke all on public.notify_log from authenticated, anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant select, insert, update on public.notify_prefs to authenticated;

-- A shared phone (siblings): turning notifications on moves the device to the
-- student who is signed in now, so it never keeps the other child's alerts.
create or replace function public.claim_push_device(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_student uuid := public.current_student_id();
begin
  if v_student is null then
    raise exception 'not a student';
  end if;
  insert into public.push_subscriptions (student_id, endpoint, p256dh, auth)
  values (v_student, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set student_id = excluded.student_id, p256dh = excluded.p256dh, auth = excluded.auth;
end; $$;
revoke all on function public.claim_push_device(text, text, text) from public, anon;
grant execute on function public.claim_push_device(text, text, text) to authenticated;
