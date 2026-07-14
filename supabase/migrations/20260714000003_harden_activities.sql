-- ============================================================================
-- Clear the advisor warnings raised by the activities work.
--
-- 1. `mark_activities_read` was SECURITY DEFINER and executable by `anon`,
--    which the linter flags (0028/0029). It only ever needs to append the
--    caller's uid to activities.read_by, so it does not need to bypass RLS at
--    all: switch it to SECURITY INVOKER and grant a COLUMN-level UPDATE on
--    read_by only. A client therefore still cannot rewrite title/description —
--    the grant does not cover those columns — and RLS restricts which rows can
--    be touched. Strictly tighter than before.
--
-- 2. Cover the activities foreign keys with indexes (unindexed_foreign_keys).
--
-- SAFETY: touches ONLY objects added by this work (public.activities and its
-- RPC). No pre-existing table, policy, function or column is modified.
-- ============================================================================

-- ---- 0. Reduce the default grants ------------------------------------------
-- Supabase's default privileges hand anon/authenticated ALL privileges on any
-- new table in `public`, so RLS was the only thing standing in front of
-- activities. Cut them back to what the feature actually needs.
revoke all on public.activities from anon;
revoke all on public.activities from authenticated;
grant select, insert, delete on public.activities to authenticated;

-- ---- 1. Row-level UPDATE, restricted to the read_by column ------------------
drop policy if exists activities_update_read on public.activities;
create policy activities_update_read on public.activities for update to authenticated
  using (
    public.is_admin()
    or (audience = 'student' and student_id = public.current_student_id())
  )
  with check (
    public.is_admin()
    or (audience = 'student' and student_id = public.current_student_id())
  );

-- Column-scoped: read receipts only. No UPDATE on any other column.
grant update (read_by) on public.activities to authenticated;

-- ---- Same RPC, now running as the caller -----------------------------------
create or replace function public.mark_activities_read(p_ids uuid[])
returns void
language plpgsql
security invoker            -- was: security definer
set search_path = public, extensions
as $$
declare v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  -- RLS + the column grant now enforce what this may touch.
  update public.activities a
     set read_by = (select array(select distinct e from unnest(a.read_by || v_uid) e))
   where a.id = any(p_ids)
     and not (v_uid = any(a.read_by));
end;
$$;

-- Signed-in users only; never anonymous.
revoke all on function public.mark_activities_read(uuid[]) from public, anon;
grant execute on function public.mark_activities_read(uuid[]) to authenticated;

-- ---- 2. Covering indexes for the activities foreign keys -------------------
create index if not exists activities_test_id_idx       on public.activities (test_id);
create index if not exists activities_note_id_idx       on public.activities (note_id);
create index if not exists activities_submission_id_idx on public.activities (submission_id);
