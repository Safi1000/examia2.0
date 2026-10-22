-- Portal integrity fixes from the 2026-10-20 audit.
--
--   1. Tests: questions stay hidden until the test opens (students can still
--      see upcoming tests on their dashboard, just not the paper).
--   2. Tests: the start time is recorded on the server when a student opens a
--      test, and the server stamps submitted_at and duration. A submission that
--      arrives past the time limit or after closing is still saved (so no work
--      is ever lost) but flagged `late` for the teacher.
--   3. Tests: one call (submit_test) saves the submission and every answer
--      together, so a dropped connection can't leave a submission with no
--      answers. Retrying after a lost response returns the saved submission.
--   4. Notes: the raw file link moves to an admin-only table. Students only
--      ever get the short-lived signed link from /api/notes/view-url.
--   5. Activities: students can only post their own fixed activity types, with
--      an internal link, to the teacher's bell.
--   6. Assignment hand-ins: only for assignments the student can see, and only
--      Cloudinary file links.
--
-- Admins are untouched. Apply after 20261016010000_harden_student_writes.sql.

-- Tests target a cohort, level and subject. These columns already exist on the
-- live database (the app writes them); this only guards a fresh install.
alter table public.tests
  add column if not exists class_id uuid references public.classes(id) on delete set null,
  add column if not exists subject_id uuid references public.subjects(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 1. Questions are hidden until the test opens, and only shown to the
--    students the test is for (cohort, level and subject, as in the app).
--    Apply when no test is in progress: an attempt already running has no
--    recorded start and would be flagged late.
drop policy if exists questions_read on public.questions;
create policy questions_read on public.questions for select to authenticated
  using (
    public.is_admin() or exists (
      select 1 from public.tests t
      where t.id = questions.test_id
        and t.status <> 'draft'
        and t.opens_at <= now()
        and public.student_can_see_activity(t.cohort_id, t.class_id, t.subject_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Server-side start time and late flag.
create table if not exists public.test_attempts (
  test_id    uuid not null references public.tests(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  started_at timestamptz not null default now(),
  primary key (test_id, student_id)
);
create index if not exists test_attempts_student_idx on public.test_attempts (student_id);

alter table public.test_attempts enable row level security;
drop policy if exists attempts_read on public.test_attempts;
create policy attempts_read on public.test_attempts for select to authenticated
  using (public.is_admin() or student_id = public.current_student_id());
-- No write policies: rows are created only by start_test_attempt() below.
revoke insert, update, delete on public.test_attempts from authenticated;
grant select on public.test_attempts to authenticated;

alter table public.submissions
  add column if not exists late boolean not null default false;

comment on column public.submissions.late is
  'Set by the server: handed in after the time limit (plus upload window and 2 minutes grace), after the test closed, or without a recorded start.';

-- Called when the test runner opens. Returns the official start time (the
-- first one, if the student reopens the test or clears their browser).
create or replace function public.start_test_attempt(p_test_id uuid)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  v_student uuid := public.current_student_id();
  v_test    public.tests%rowtype;
  v_started timestamptz;
begin
  if v_student is null then
    raise exception 'not a student';
  end if;

  select started_at into v_started
    from public.test_attempts
   where test_id = p_test_id and student_id = v_student;
  if found then
    return v_started;
  end if;

  select * into v_test from public.tests where id = p_test_id;
  if not found
     or v_test.status = 'draft'
     or not public.student_can_see_activity(v_test.cohort_id, v_test.class_id, v_test.subject_id) then
    raise exception 'test not available';
  end if;
  if now() < v_test.opens_at or now() > v_test.closes_at then
    raise exception 'test is not open';
  end if;

  insert into public.test_attempts (test_id, student_id)
  values (p_test_id, v_student)
  on conflict (test_id, student_id) do nothing;

  select started_at into v_started
    from public.test_attempts
   where test_id = p_test_id and student_id = v_student;
  return v_started;
end; $$;

revoke all on function public.start_test_attempt(uuid) from public, anon;
grant execute on function public.start_test_attempt(uuid) to authenticated;

-- Every student submission (through submit_test or a direct insert) gets its
-- times from the server. Runs after a_sanitize_student_submission.
create or replace function public.enforce_student_submission()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_test    public.tests%rowtype;
  v_started timestamptz;
  v_seconds int;
begin
  if public.is_admin() then
    return new;
  end if;

  select * into v_test from public.tests where id = new.test_id;
  if not found
     or v_test.status = 'draft'
     or not public.student_can_see_activity(v_test.cohort_id, v_test.class_id, v_test.subject_id) then
    raise exception 'test not available';
  end if;
  if now() < v_test.opens_at then
    raise exception 'test is not open yet';
  end if;

  select started_at into v_started
    from public.test_attempts
   where test_id = new.test_id and student_id = new.student_id;

  v_seconds := extract(epoch from now() - coalesce(v_started, now()))::int;

  new.started_at := coalesce(v_started, now());
  new.submitted_at := now();
  new.duration_seconds := least(v_seconds, v_test.duration_minutes * 60);
  new.late := v_started is null
    or v_seconds > (v_test.duration_minutes + coalesce(v_test.upload_minutes, 0)) * 60 + 120
    or now() > v_test.closes_at + interval '2 minutes';
  return new;
end; $$;

drop trigger if exists b_enforce_student_submission on public.submissions;
create trigger b_enforce_student_submission
  before insert on public.submissions
  for each row execute function public.enforce_student_submission();

revoke all on function public.enforce_student_submission() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. One call saves the submission and all its answers, or nothing.
-- SECURITY INVOKER: the student's own row-level security and the sanitize /
-- grading / timing triggers all still apply.
create or replace function public.submit_test(
  p_id uuid,
  p_test_id uuid,
  p_auto boolean,
  p_answers jsonb
)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_student  uuid := public.current_student_id();
  v_existing uuid;
begin
  if v_student is null then
    raise exception 'not a student';
  end if;

  -- Already handed in (for example, the first try worked but the reply was
  -- lost on a bad connection): return the saved one instead of failing.
  select id into v_existing
    from public.submissions
   where test_id = p_test_id and student_id = v_student;
  if found then
    return v_existing;
  end if;

  insert into public.submissions (id, test_id, student_id, status, started_at, submitted_at, auto_submitted, duration_seconds)
  values (p_id, p_test_id, v_student, 'submitted', now(), now(), coalesce(p_auto, false), 0);

  insert into public.answers (submission_id, question_id, type, selected_index, text, photo_url, photo_urls)
  select
    p_id,
    (a ->> 'question_id')::uuid,
    a ->> 'type',
    (a ->> 'selected_index')::int,
    a ->> 'text',
    a ->> 'photo_url',
    coalesce(
      (select array_agg(u) from jsonb_array_elements_text(coalesce(a -> 'photo_urls', '[]'::jsonb)) as u),
      '{}'::text[]
    )
  from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) as a;

  return p_id;
end; $$;

revoke all on function public.submit_test(uuid, uuid, boolean, jsonb) from public, anon;
grant execute on function public.submit_test(uuid, uuid, boolean, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Note files: the raw link is admin-only.
create table if not exists public.note_files (
  note_id  uuid primary key references public.notes(id) on delete cascade deferrable initially deferred,
  file_url text not null
);

alter table public.note_files enable row level security;
drop policy if exists note_files_admin on public.note_files;
create policy note_files_admin on public.note_files for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.note_files to authenticated;

insert into public.note_files (note_id, file_url)
select id, file_url from public.notes where file_url is not null
on conflict (note_id) do update set file_url = excluded.file_url;

alter table public.notes alter column file_url drop not null;
update public.notes set file_url = null where file_url is not null;

-- The admin app still sends file_url when uploading: move it across and keep
-- the notes row (which students can read) free of it.
create or replace function public.move_note_file_url()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.file_url is not null then
    insert into public.note_files (note_id, file_url)
    values (new.id, new.file_url)
    on conflict (note_id) do update set file_url = excluded.file_url;
    new.file_url := null;
  end if;
  return new;
end; $$;

drop trigger if exists move_note_file_url on public.notes;
create trigger move_note_file_url
  before insert or update on public.notes
  for each row execute function public.move_note_file_url();

revoke all on function public.move_note_file_url() from public, anon, authenticated;

-- Used by /api/notes/view-url: the link only comes back if the caller may
-- see the note (admin, or a student it is assigned to).
create or replace function public.note_file_url(p_note_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_url text;
begin
  if not (
    public.is_admin() or p_note_id in (
      select na.note_id from public.note_assignments na
      where public.student_can_access_note_assignment(na.cohort_id, na.class_id, na.subject_id)
    )
  ) then
    return null;
  end if;
  select file_url into v_url from public.note_files where note_id = p_note_id;
  return v_url;
end; $$;

revoke all on function public.note_file_url(uuid) from public, anon;
grant execute on function public.note_file_url(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Activities: students post only their own fixed types, internal links.
drop policy if exists activities_insert on public.activities;
create policy activities_insert on public.activities for insert to authenticated
  with check (
    public.is_admin()
    or (
      student_id = public.current_student_id()
      and audience = 'admin'
      and type in ('test_started', 'test_submitted', 'test_completed', 'notes_accessed', 'notes_downloaded')
      and char_length(title) <= 200
      and char_length(coalesce(description, '')) <= 300
      and (link is null or (link like '/%' and link not like '//%'))
    )
  );

-- ---------------------------------------------------------------------------
-- 6. Assignment hand-ins: only for assignments the student can see, and only
-- Cloudinary links. Late hand-ins are still allowed (the teacher sees the time).
drop policy if exists asub_insert on public.assignment_submissions;
create policy asub_insert on public.assignment_submissions for insert to authenticated
  with check (
    public.is_admin() or (
      student_id = public.current_student_id()
      and exists (
        select 1 from public.assignments a
        where a.id = assignment_id
          and public.student_can_access_note_assignment(a.cohort_id, a.class_id, a.subject_id)
      )
      and not exists (
        select 1 from unnest(file_urls) as u where u not like 'https://res.cloudinary.com/%'
      )
    )
  );

drop policy if exists asub_update on public.assignment_submissions;
create policy asub_update on public.assignment_submissions for update to authenticated
  using (public.is_admin() or student_id = public.current_student_id())
  with check (
    public.is_admin() or (
      student_id = public.current_student_id()
      and exists (
        select 1 from public.assignments a
        where a.id = assignment_id
          and public.student_can_access_note_assignment(a.cohort_id, a.class_id, a.subject_id)
      )
      and not exists (
        select 1 from unnest(file_urls) as u where u not like 'https://res.cloudinary.com/%'
      )
    )
  );
