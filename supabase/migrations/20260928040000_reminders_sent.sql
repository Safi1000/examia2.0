-- Reminders that have already gone out, so the same parent is not messaged
-- twice about the same thing. The panel itself derives what is due; this table
-- only records what has been dealt with.
create table if not exists public.reminders_sent (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  -- "missed_test" | "absent_streak" | "report_due", extensible without DDL.
  kind text not null,
  -- What it was about: a test id, a date, a month. Together with kind and
  -- student this is what makes a reminder unique.
  ref text not null,
  sent_at timestamptz not null default now(),
  unique (student_id, kind, ref)
);

alter table public.reminders_sent enable row level security;

drop policy if exists reminders_admin on public.reminders_sent;
create policy reminders_admin on public.reminders_sent for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
