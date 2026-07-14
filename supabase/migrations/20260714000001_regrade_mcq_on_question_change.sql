-- ============================================================================
-- Recompute MCQ marks when a question changes.
--
-- WHY: public.grade_mcq() is a BEFORE INSERT trigger on answers, so a MCQ's
-- marks were frozen at submission time. If a teacher later fixed the correct
-- option or changed the question's mark value, every already-submitted answer
-- kept its old marks_awarded / is_correct / correct_index — the "marks not
-- updating" bug. submissions.total_marks is maintained by the existing
-- sum_marks_after_write trigger, which fires on UPDATE of answers, so totals
-- follow automatically once the answer rows are corrected.
--
-- SAFETY: purely additive. No table is dropped, renamed, or altered; no column
-- is removed. Only MCQ answers are touched — text/photo answers keep the marks
-- a teacher gave them by hand. Submission rows themselves are never deleted.
-- ============================================================================

create or replace function public.regrade_mcq_answers(p_question_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_type  text;
  v_marks int;
  v_key   int;
begin
  select q.type, q.marks into v_type, v_marks
    from public.questions q
   where q.id = p_question_id;

  -- Only MCQs are auto-graded; leave hand-marked answers alone.
  if v_type is distinct from 'mcq' then
    return;
  end if;

  select correct_index into v_key
    from public.question_keys
   where question_id = p_question_id;

  update public.answers a
     set correct_index = v_key,
         is_correct    = (a.selected_index is not null and a.selected_index = v_key),
         marks_awarded = case
                           when a.selected_index is not null and a.selected_index = v_key
                           then v_marks
                           else 0
                         end
   where a.question_id = p_question_id
     and a.type = 'mcq'
     and (
       a.correct_index is distinct from v_key
       or a.is_correct is distinct from (a.selected_index is not null and a.selected_index = v_key)
       or a.marks_awarded is distinct from (case
                                              when a.selected_index is not null and a.selected_index = v_key
                                              then v_marks
                                              else 0
                                            end)
     );
end;
$$;

-- ---- Fires when the answer key is set or corrected -------------------------
create or replace function public.regrade_on_key_change()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform public.regrade_mcq_answers(new.question_id);
  return null;
end;
$$;

drop trigger if exists regrade_after_key_write on public.question_keys;
create trigger regrade_after_key_write
  after insert or update on public.question_keys
  for each row execute function public.regrade_on_key_change();

-- ---- Fires when the question's mark value (or its type) changes ------------
create or replace function public.regrade_on_question_change()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.marks is distinct from old.marks or new.type is distinct from old.type then
    perform public.regrade_mcq_answers(new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists regrade_after_question_update on public.questions;
create trigger regrade_after_question_update
  after update on public.questions
  for each row execute function public.regrade_on_question_change();

-- Trigger functions are invoked by the triggers themselves, never called
-- directly by a client, so no EXECUTE grant is issued to `authenticated`
-- (matching grade_mcq / sum_submission_marks).
revoke all on function public.regrade_mcq_answers(uuid)      from public, anon, authenticated;
revoke all on function public.regrade_on_key_change()        from public, anon, authenticated;
revoke all on function public.regrade_on_question_change()   from public, anon, authenticated;
