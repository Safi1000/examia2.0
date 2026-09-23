-- Weekly assignments: admin posts work with a deadline, students hand in
-- photos or a PDF, and the only response is written feedback (no marks).
create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  instructions text,
  attachment_urls text[] not null default '{}',
  due_at timestamptz not null,
  cohort_id uuid references public.cohorts(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  subject_id uuid references public.subjects(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  file_urls text[] not null default '{}',
  submitted_at timestamptz not null default now(),
  feedback text,
  feedback_at timestamptz,
  unique (assignment_id, student_id)
);

create index if not exists assignment_submissions_assignment_idx
  on public.assignment_submissions (assignment_id);

alter table public.assignments enable row level security;
alter table public.assignment_submissions enable row level security;

-- Targeting reuses the note helper: cohort + optional class + optional subject.
drop policy if exists assignments_read on public.assignments;
create policy assignments_read on public.assignments for select to authenticated
  using (public.is_admin() or public.student_can_access_note_assignment(cohort_id, class_id, subject_id));

drop policy if exists assignments_write on public.assignments;
create policy assignments_write on public.assignments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists asub_read on public.assignment_submissions;
create policy asub_read on public.assignment_submissions for select to authenticated
  using (public.is_admin() or student_id = public.current_student_id());

drop policy if exists asub_insert on public.assignment_submissions;
create policy asub_insert on public.assignment_submissions for insert to authenticated
  with check (public.is_admin() or student_id = public.current_student_id());

drop policy if exists asub_update on public.assignment_submissions;
create policy asub_update on public.assignment_submissions for update to authenticated
  using (public.is_admin() or student_id = public.current_student_id())
  with check (public.is_admin() or student_id = public.current_student_id());

drop policy if exists asub_delete on public.assignment_submissions;
create policy asub_delete on public.assignment_submissions for delete to authenticated
  using (public.is_admin() or student_id = public.current_student_id());

-- RLS can't scope a policy to a column: without this a student re-uploading
-- their work could blank out the teacher's feedback.
create or replace function public.assignment_feedback_is_admin_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    new.feedback := old.feedback;
    new.feedback_at := old.feedback_at;
  end if;
  return new;
end;
$$;

drop trigger if exists assignment_submissions_keep_feedback on public.assignment_submissions;
create trigger assignment_submissions_keep_feedback
  before update on public.assignment_submissions
  for each row execute function public.assignment_feedback_is_admin_only();

-- A trigger function has no business being callable over the REST API.
revoke execute on function public.assignment_feedback_is_admin_only() from public, anon, authenticated;
