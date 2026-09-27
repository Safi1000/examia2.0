-- A whole-school register has no class, and Postgres treats two NULL class_ids
-- as different values, so the upsert never matched and tried to insert a row
-- with an id that already existed. NULLS NOT DISTINCT makes NULL == NULL here.
alter table public.attendance_days
  drop constraint if exists attendance_days_student_id_class_id_on_date_key;

alter table public.attendance_days
  add constraint attendance_days_student_id_class_id_on_date_key
  unique nulls not distinct (student_id, class_id, on_date);
