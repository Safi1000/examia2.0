-- ============================================================================
-- 1. Multi-image answers  2. Recent-activity feed
--
-- SAFETY: purely additive. Nothing is dropped, renamed, reset or recreated; no
-- column is removed. answers.photo_url is KEPT and still populated with the
-- first image, so existing grading, results and AI evaluation keep working
-- untouched — photo_urls is a superset.
-- ============================================================================

-- ---- 1. Multiple images per photo answer -----------------------------------
alter table public.answers
  add column if not exists photo_urls text[] not null default '{}';

comment on column public.answers.photo_urls is
  'All images for a photo answer. photo_url remains the first image for backward compatibility.';

-- Backfill: existing single-image answers become one-element arrays.
update public.answers
   set photo_urls = array[photo_url]
 where photo_url is not null
   and coalesce(array_length(photo_urls, 1), 0) = 0;

-- ---- 2. Activity feed ------------------------------------------------------
-- One table. Read state lives in read_by uuid[] (auth.uid values), mirroring
-- the existing announcements.dismissed_by convention rather than adding a
-- second table.
create table if not exists public.activities (
  id            uuid primary key default gen_random_uuid(),
  type          text not null,
  title         text not null,
  description   text,
  -- Optional links back to the subject of the activity (all ON DELETE CASCADE
  -- so removing a test/note/student cleans its feed entries up automatically).
  student_id    uuid references public.students(id)    on delete cascade,
  test_id       uuid references public.tests(id)       on delete cascade,
  note_id       uuid references public.notes(id)       on delete cascade,
  submission_id uuid references public.submissions(id) on delete cascade,
  -- Where clicking the notification should navigate. Null = not navigable.
  link          text,
  -- 'admin'   -> only admins see it (student activity reported up to staff)
  -- 'student' -> the referenced student sees it (plus admins)
  audience      text not null default 'admin' check (audience in ('admin', 'student')),
  read_by       uuid[] not null default '{}',
  created_at    timestamptz not null default now()
);

create index if not exists activities_created_at_idx on public.activities (created_at desc);
create index if not exists activities_student_idx    on public.activities (student_id);

alter table public.activities enable row level security;

-- Admin sees everything. A student sees only entries addressed to them.
drop policy if exists activities_read on public.activities;
create policy activities_read on public.activities for select to authenticated
  using (
    public.is_admin()
    or (audience = 'student' and student_id = public.current_student_id())
  );

-- Anyone authenticated may log an activity, but a student may only log one
-- against themselves — they cannot forge entries for another student.
drop policy if exists activities_insert on public.activities;
create policy activities_insert on public.activities for insert to authenticated
  with check (
    public.is_admin()
    or student_id = public.current_student_id()
  );

-- Only admins may remove feed entries.
drop policy if exists activities_delete on public.activities;
create policy activities_delete on public.activities for delete to authenticated
  using (public.is_admin());

grant select, insert, delete on public.activities to authenticated;

-- ---- Read receipts ---------------------------------------------------------
-- No UPDATE is granted on the table (a client could otherwise rewrite titles),
-- so marking-as-read goes through this RPC, exactly like dismiss_announcement.
create or replace function public.mark_activities_read(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  update public.activities a
     set read_by = (select array(select distinct e from unnest(a.read_by || v_uid) e))
   where a.id = any(p_ids)
     and not (v_uid = any(a.read_by))
     -- Can only mark rows this user is actually allowed to see.
     and (
       public.is_admin()
       or (a.audience = 'student' and a.student_id = public.current_student_id())
     );
end;
$$;

grant execute on function public.mark_activities_read(uuid[]) to authenticated;

-- ---- Realtime --------------------------------------------------------------
-- Push new activities to open clients instead of polling.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'activities'
  ) then
    alter publication supabase_realtime add table public.activities;
  end if;
end $$;
