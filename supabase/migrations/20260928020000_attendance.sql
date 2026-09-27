-- Attendance, recorded either way:
--   daily   -> one row per student per class per day
--   monthly -> one percentage per student per month (typed, or filled in from
--              the daily rows and still editable)
create table if not exists public.attendance_days (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  class_id uuid references public.classes(id) on delete set null,
  on_date date not null,
  status text not null check (status in ('present', 'late', 'absent')),
  created_at timestamptz not null default now(),
  unique (student_id, class_id, on_date)
);

create index if not exists attendance_days_date_idx on public.attendance_days (on_date);

create table if not exists public.attendance_months (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  month date not null,
  percent numeric(5,2) not null check (percent >= 0 and percent <= 100),
  created_at timestamptz not null default now(),
  unique (student_id, month)
);

alter table public.attendance_days enable row level security;
alter table public.attendance_months enable row level security;

drop policy if exists att_days_read on public.attendance_days;
create policy att_days_read on public.attendance_days for select to authenticated
  using (public.is_admin() or student_id = public.current_student_id());

drop policy if exists att_days_write on public.attendance_days;
create policy att_days_write on public.attendance_days for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists att_months_read on public.attendance_months;
create policy att_months_read on public.attendance_months for select to authenticated
  using (public.is_admin() or student_id = public.current_student_id());

drop policy if exists att_months_write on public.attendance_months;
create policy att_months_write on public.attendance_months for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
