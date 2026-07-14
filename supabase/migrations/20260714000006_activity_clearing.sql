-- ============================================================================
-- Per-user "clear notification".
--
-- WHY NOT A DELETE: an activity row is SHARED. One broadcast row (audience
-- 'student' + cohort_id) is the notification an entire cohort sees, so deleting
-- it to clear one student's bell would clear it for all 23 of them. Read state
-- already solves this problem the same way — read_by uuid[], and
-- announcements.dismissed_by before it — so clearing is a per-user dismissal on
-- the same model, not a row delete.
--
-- SAFETY: purely additive.
--   * One NULLABLE-by-default column (cleared_by, defaulting to '{}') on
--     public.activities. No column dropped, renamed or backfilled.
--   * One new RPC. The existing activities_delete policy (admin-only hard
--     delete) is left exactly as it is.
--   * The UPDATE grant stays COLUMN-SCOPED: authenticated may now write
--     read_by and cleared_by, and nothing else — a client still cannot rewrite
--     a title, a link or an audience.
-- ============================================================================

alter table public.activities
  add column if not exists cleared_by uuid[] not null default '{}';

comment on column public.activities.cleared_by is
  'auth.uid()s that have cleared this entry from their own feed. The row itself '
  'survives for everyone else it was addressed to.';

-- Read receipts already own read_by; clearing owns cleared_by. Same shape.
grant update (read_by, cleared_by) on public.activities to authenticated;

-- ---- Clear ------------------------------------------------------------------
-- Mirrors mark_activities_read: SECURITY INVOKER, so RLS decides which rows the
-- caller may touch at all, and the column grant decides what they may write.
-- Passing no ids clears everything currently visible to the caller ("Clear all"),
-- which is why the id filter is applied only when p_ids is non-null.
create or replace function public.clear_activities(p_ids uuid[] default null)
returns void
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  update public.activities a
     set cleared_by = (select array(select distinct e from unnest(a.cleared_by || v_uid) e))
   where (p_ids is null or a.id = any(p_ids))
     and not (v_uid = any(a.cleared_by));
end;
$$;

revoke all on function public.clear_activities(uuid[]) from public, anon;
grant execute on function public.clear_activities(uuid[]) to authenticated;
