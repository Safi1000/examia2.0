-- ============================================================================
-- Push newly assigned notes to signed-in students.
--
-- WHY: a student's cache is hydrated at login and re-read only when the tab
-- regains focus (see components/DataSync). `activities` was the only table in
-- the realtime publication, so a note assigned while a student had the app open
-- stayed invisible until they refocused or reloaded — which reads exactly like
-- "notes are not appearing for students".
--
-- SAFETY: publication membership only. No table, column, policy, grant or
-- function is touched, and RLS still decides what each session receives —
-- postgres_changes is filtered by the same notes_read / na_read policies, so
-- this cannot expose a note to a student who could not already query it.
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'notes'
  ) then
    alter publication supabase_realtime add table public.notes;
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'note_assignments'
  ) then
    alter publication supabase_realtime add table public.note_assignments;
  end if;
end $$;
