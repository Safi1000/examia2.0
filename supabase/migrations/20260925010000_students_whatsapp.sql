-- Parent's WhatsApp number, stored in E.164 so every number dials the same way
-- and wa.me links can be built from it directly.
alter table public.students
  add column if not exists whatsapp text;

alter table public.students
  drop constraint if exists students_whatsapp_e164;
alter table public.students
  add constraint students_whatsapp_e164
  check (whatsapp is null or whatsapp ~ '^\+[1-9][0-9]{7,14}$');
