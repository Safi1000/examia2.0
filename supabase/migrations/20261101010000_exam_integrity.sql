-- Exam integrity, from the 1 Nov 2026 audit. NOT applied yet: run once in the
-- Supabase SQL editor (or with the migrations) when a developer is next on it.
-- The portal already blocks releasing results while a test is open; these make
-- the database itself enforce the same rules, so nothing depends on the app.

-- 1. Answers are readable by the student only once released AND the test has
--    closed: an early release can never show the answers to someone still sitting it.
drop policy if exists ans_read on public.answers;
create policy ans_read on public.answers for select to authenticated
  using (
    public.is_admin() or exists (
      select 1 from public.submissions s
      join public.tests t on t.id = s.test_id
      where s.id = answers.submission_id
        and s.student_id = public.current_student_id()
        and s.status = 'released'
        and t.closes_at <= now()
    )
  );

-- 2. Answers can only be written in the same step as handing in (submit_test
--    inserts the submission and its answers together), never added afterwards.
drop policy if exists ans_insert on public.answers;
create policy ans_insert on public.answers for insert to authenticated
  with check (
    public.is_admin() or exists (
      select 1 from public.submissions s
      where s.id = submission_id
        and s.student_id = public.current_student_id()
        and s.status <> 'released'
        and s.created_at = now()
        and exists (
          select 1 from public.questions q
          where q.id = answers.question_id and q.test_id = s.test_id
        )
    )
  );

-- 3. Assignment hand-in times come from the server clock, not the phone.
create or replace function public.stamp_assignment_submission()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    new.submitted_at := now();
  end if;
  return new;
end;
$$;
revoke all on function public.stamp_assignment_submission() from public, anon, authenticated;
drop trigger if exists stamp_assignment_submission on public.assignment_submissions;
create trigger stamp_assignment_submission
  before insert or update on public.assignment_submissions
  for each row execute function public.stamp_assignment_submission();
