-- A generated monthly report and its short private link.
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  -- First day of the month the report covers.
  month date not null,
  token text not null unique,
  pdf_url text not null,
  teacher_note text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '90 days',
  sent_at timestamptz,
  unique (student_id, month)
);

create index if not exists reports_token_idx on public.reports (token);

alter table public.reports enable row level security;

-- Staff manage reports. There is deliberately NO select policy for anonymous
-- visitors: the public page reads one row through the function below, so a
-- link gives out that report and nothing else.
drop policy if exists reports_admin on public.reports;
create policy reports_admin on public.reports for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists reports_own on public.reports;
create policy reports_own on public.reports for select to authenticated
  using (student_id = public.current_student_id());

-- Public lookup by token: returns the report only while the link is alive.
create or replace function public.report_by_token(p_token text)
returns table (
  student_name text,
  month date,
  pdf_url text,
  teacher_note text,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select s.username, r.month, r.pdf_url, r.teacher_note, r.expires_at
  from public.reports r
  join public.students s on s.id = r.student_id
  where r.token = p_token
    and r.expires_at > now()
  limit 1;
$$;

revoke execute on function public.report_by_token(text) from public;
grant execute on function public.report_by_token(text) to anon, authenticated;
