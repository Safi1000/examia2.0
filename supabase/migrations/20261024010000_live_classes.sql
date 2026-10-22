-- Live classes: the Meet link and recording for each class, and who joined.
--
--   class_links  one row per class per day (level + subject + date), with the
--                Meet link Hamza pastes and, later, the recording link.
--   class_joins  one row per student per class they tapped Join on. Used to
--                fill attendance automatically.
--
-- The weekly timetable itself lives in code (lib/classes.ts), so changing a
-- time never needs the database.

create table if not exists public.class_links (
  on_date       date not null,
  class_id      uuid not null references public.classes(id) on delete cascade,
  subject_id    uuid not null references public.subjects(id) on delete cascade,
  meet_url      text,
  recording_url text,
  updated_at    timestamptz not null default now(),
  primary key (on_date, class_id, subject_id),
  check (meet_url is null or meet_url ~ '^https://'),
  check (recording_url is null or recording_url ~ '^https://')
);

create table if not exists public.class_joins (
  student_id uuid not null references public.students(id) on delete cascade,
  on_date    date not null,
  class_id   uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (student_id, on_date, class_id, subject_id)
);
create index if not exists class_joins_day_idx on public.class_joins (on_date);

-- Is the signed-in student in this level? Their own levels, or their
-- cohort's when they have none set (same rule as lib/classes.ts), and only
-- while their cohort is switched on.
create or replace function public.student_in_level(p_class uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.students s
    left join public.cohorts c on c.id = s.cohort_id
    where s.id = public.current_student_id()
      and coalesce(c.active, true)
      and (
        exists (select 1 from public.student_classes sc where sc.student_id = s.id and sc.class_id = p_class)
        or (
          not exists (select 1 from public.student_classes sc where sc.student_id = s.id)
          and exists (select 1 from public.cohort_classes cc where cc.cohort_id = s.cohort_id and cc.class_id = p_class)
        )
      )
  );
$$;
revoke all on function public.student_in_level(uuid) from public, anon;
grant execute on function public.student_in_level(uuid) to authenticated;

alter table public.class_links enable row level security;
alter table public.class_joins enable row level security;

-- Links: Hamza writes; a current student reads only their own levels' links.
drop policy if exists class_links_read on public.class_links;
create policy class_links_read on public.class_links for select to authenticated
  using (public.is_admin() or public.student_in_level(class_id));

drop policy if exists class_links_write on public.class_links;
create policy class_links_write on public.class_links for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Joins: a student sees their own, Hamza sees all. Inserts go through
-- join_class() below so the attendance row is written in the same step.
drop policy if exists class_joins_read on public.class_joins;
create policy class_joins_read on public.class_joins for select to authenticated
  using (public.is_admin() or student_id = public.current_student_id());

drop policy if exists class_joins_admin on public.class_joins;
create policy class_joins_admin on public.class_joins for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select on public.class_links, public.class_joins to authenticated;
grant insert, update, delete on public.class_links, public.class_joins to authenticated;

-- Student taps Join: remember it and mark them present for that level today,
-- unless that day already has a mark (by hand, for any class). Returns the
-- Meet link.
create or replace function public.join_class(p_class uuid, p_subject uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student uuid := public.current_student_id();
  v_day     date := (now() at time zone 'Asia/Karachi')::date;
  v_url     text;
begin
  if v_student is null then
    raise exception 'not a student';
  end if;
  if not public.student_in_level(p_class) then
    return null;
  end if;

  select meet_url into v_url from public.class_links
   where on_date = v_day and class_id = p_class and subject_id = p_subject;
  if v_url is null then
    return null;
  end if;

  insert into public.class_joins (student_id, on_date, class_id, subject_id)
  values (v_student, v_day, p_class, p_subject)
  on conflict do nothing;

  if not exists (
    select 1 from public.attendance_days
     where student_id = v_student and on_date = v_day
  ) then
    insert into public.attendance_days (student_id, class_id, on_date, status)
    values (v_student, p_class, v_day, 'present')
    on conflict (student_id, class_id, on_date) do nothing;
  end if;

  return v_url;
end;
$$;

revoke all on function public.join_class(uuid, uuid) from public, anon;
grant execute on function public.join_class(uuid, uuid) to authenticated;
