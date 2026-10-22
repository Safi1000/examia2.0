-- Harden what a STUDENT can write. Found in the 2026-10-16 audit:
--
--   1. answers: a student inserts their own answer rows. grade_mcq() overwrites
--      the marks for MCQs only, so on a written or photo answer a student could
--      send marks_awarded = 100 (or their own feedback) and the score total
--      trigger would count it.
--   2. answers: nothing stopped a student adding answers to a submission after
--      it was released.
--   3. submissions: a student inserts their own submission row and could set
--      status = 'released', released_at or total_marks themselves.
--   4. assignment_submissions: feedback was protected on UPDATE only, so a
--      student could write their own "teacher feedback" on INSERT.
--
-- Admins are untouched. Nothing here changes what the app sends today: the
-- student app never sets these columns, so honest clients see no difference.

-- 1. Answers: grading columns are the teacher's (and the MCQ trigger's) only.
create or replace function public.sanitize_student_answer()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_admin() then
    new.marks_awarded := null;
    new.is_correct := null;
    new.correct_index := null;
    new.feedback := null;
    new.annotations := '{}'::jsonb;
    -- The answer type must match the question it answers.
    select q.type into new.type from public.questions q where q.id = new.question_id;
  end if;
  return new;
end; $$;

-- Trigger names fire in alphabetical order: "a_…" runs before
-- grade_mcq_before_insert, so MCQ auto-marking still sets the real marks.
drop trigger if exists a_sanitize_student_answer on public.answers;
create trigger a_sanitize_student_answer
  before insert on public.answers
  for each row execute function public.sanitize_student_answer();

revoke all on function public.sanitize_student_answer() from public, anon, authenticated;

-- 2. Answers: only into the student's own submission, and never once released.
drop policy if exists ans_insert on public.answers;
create policy ans_insert on public.answers for insert to authenticated
  with check (
    public.is_admin() or exists (
      select 1 from public.submissions s
      where s.id = submission_id
        and s.student_id = public.current_student_id()
        and s.status <> 'released'
        -- The question must belong to this submission's own test.
        and exists (
          select 1 from public.questions q
          where q.id = answers.question_id and q.test_id = s.test_id
        )
    )
  );

-- 3. Submissions: a student can hand in, never release or score.
create or replace function public.sanitize_student_submission()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_admin() then
    if new.status not in ('in_progress', 'submitted') then
      new.status := 'submitted';
    end if;
    new.released_at := null;
    new.total_marks := null;
  end if;
  return new;
end; $$;

drop trigger if exists a_sanitize_student_submission on public.submissions;
create trigger a_sanitize_student_submission
  before insert on public.submissions
  for each row execute function public.sanitize_student_submission();

revoke all on function public.sanitize_student_submission() from public, anon, authenticated;

-- 4. Assignment work: feedback is the teacher's on insert too.
create or replace function public.assignment_feedback_admin_only_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    new.feedback := null;
    new.feedback_at := null;
  end if;
  return new;
end; $$;

drop trigger if exists assignment_submissions_feedback_insert on public.assignment_submissions;
create trigger assignment_submissions_feedback_insert
  before insert on public.assignment_submissions
  for each row execute function public.assignment_feedback_admin_only_insert();

revoke all on function public.assignment_feedback_admin_only_insert() from public, anon, authenticated;
