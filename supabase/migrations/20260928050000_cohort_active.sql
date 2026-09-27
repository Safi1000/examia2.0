-- A finished cohort can be switched off: nothing is deleted, its students just
-- stop being able to use the portal and it drops out of filters and analytics.
alter table public.cohorts
  add column if not exists active boolean not null default true;

-- Enforced at the root: every student-scoped policy resolves the caller through
-- this function, so a student in a switched-off cohort reads nothing of their
-- own — the client-side sign-out is then only a courtesy message.
create or replace function public.current_student_id()
returns uuid
language sql
stable
set search_path to 'public', 'extensions'
as $function$
  select s.id
  from public.students s
  left join public.cohorts c on c.id = s.cohort_id
  where s.user_id = auth.uid()
    and coalesce(c.active, true)
  limit 1;
$function$;
