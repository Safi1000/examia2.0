-- The student's own number (the parent's is `whatsapp`), same E.164 shape, and
-- a square profile photo already cropped and resized client-side.
alter table public.students
  add column if not exists phone text,
  add column if not exists photo_url text;

alter table public.students drop constraint if exists students_phone_e164;
alter table public.students
  add constraint students_phone_e164
  check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$');
