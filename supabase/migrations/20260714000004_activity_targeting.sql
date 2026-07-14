-- ============================================================================
-- Broadcast notifications: address an activity to a cohort/class/subject
-- instead of only to a single student.
--
-- WHY: activities.student_id is a single uuid, and the student-facing RLS rule
-- is `audience = 'student' and student_id = current_student_id()`. That can
-- only ever address ONE student, so teacher-side events (test created, notes
-- assigned, results released, announcements) had nowhere to go — they were all
-- logged with the default audience 'admin' and students effectively received
-- nothing. These columns let one row address a whole cohort.
--
-- SAFETY: purely additive.
--   * Three NULLABLE columns are added to public.activities. Nothing dropped,
--     renamed or backfilled; every existing row keeps working unchanged
--     (student_id targeting still matches first in the policy below).
--   * Only the two policies belonging to public.activities are replaced, and
--     both are WIDENED, never narrowed: admins keep seeing everything and a
--     student keeps seeing rows addressed to them personally.
--   * No other table, policy, function or column is touched.
-- ============================================================================

-- ---- 1. Targeting columns --------------------------------------------------
-- Semantics deliberately mirror public.tests (see selectors.testsForStudent):
-- NULL means "not scoped by this dimension", i.e. everyone matches.
alter table public.activities
  add column if not exists cohort_id  uuid references public.cohorts(id)  on delete cascade,
  add column if not exists class_id   uuid references public.classes(id)  on delete cascade,
  add column if not exists subject_id uuid references public.subjects(id) on delete cascade;

comment on column public.activities.cohort_id is
  'Broadcast target. NULL = every cohort. Only consulted when student_id is NULL.';

-- Cover the new foreign keys (the linter flags unindexed FKs).
create index if not exists activities_cohort_id_idx  on public.activities (cohort_id);
create index if not exists activities_class_id_idx   on public.activities (class_id);
create index if not exists activities_subject_id_idx on public.activities (subject_id);

-- ---- 2. Visibility helper --------------------------------------------------
-- Same shape as the existing student_can_access_note_assignment(), with ONE
-- deliberate difference: a NULL cohort here means "all cohorts" (as it does on
-- tests), whereas note assignments always carry a cohort. SECURITY DEFINER for
-- the same reason as that function: it reads students / student_classes /
-- student_subjects, whose own RLS would otherwise re-enter this check.
create or replace function public.student_can_see_activity(
  p_cohort_id  uuid,
  p_class_id   uuid,
  p_subject_id uuid
) returns boolean language sql stable security definer set search_path = public, extensions as $$
  select
    (p_cohort_id is null or p_cohort_id = public.current_student_cohort())
    and (p_class_id is null or exists (
      select 1 from public.student_classes sc
      where sc.student_id = public.current_student_id() and sc.class_id = p_class_id
    ))
    and (p_subject_id is null or exists (
      select 1 from public.student_subjects ss
      where ss.student_id = public.current_student_id() and ss.subject_id = p_subject_id
    ));
$$;

-- Signed-in users only; never anonymous (matches harden_function_exposure).
revoke all on function public.student_can_see_activity(uuid, uuid, uuid) from public, anon;
grant execute on function public.student_can_see_activity(uuid, uuid, uuid) to authenticated;

-- ---- 3. Widen the two activities policies ----------------------------------
-- A student may see a row addressed to them by id (unchanged behaviour), OR a
-- broadcast row (student_id is null) whose cohort/class/subject they match.
-- Admin still sees everything.
drop policy if exists activities_read on public.activities;
create policy activities_read on public.activities for select to authenticated
  using (
    public.is_admin()
    or (
      audience = 'student'
      and (
        student_id = public.current_student_id()
        or (
          student_id is null
          and public.student_can_see_activity(cohort_id, class_id, subject_id)
        )
      )
    )
  );

-- Read receipts must follow visibility exactly, or a student could see a
-- broadcast notification they are unable to mark as read. Same predicate.
-- The UPDATE grant stays column-scoped to read_by (see harden_activities), so
-- widening this does not let anyone rewrite a title or a link.
drop policy if exists activities_update_read on public.activities;
create policy activities_update_read on public.activities for update to authenticated
  using (
    public.is_admin()
    or (
      audience = 'student'
      and (
        student_id = public.current_student_id()
        or (
          student_id is null
          and public.student_can_see_activity(cohort_id, class_id, subject_id)
        )
      )
    )
  )
  with check (
    public.is_admin()
    or (
      audience = 'student'
      and (
        student_id = public.current_student_id()
        or (
          student_id is null
          and public.student_can_see_activity(cohort_id, class_id, subject_id)
        )
      )
    )
  );

-- INSERT is unchanged: a student may still only log against themselves, so a
-- student cannot forge a broadcast (student_id null fails the existing check).
