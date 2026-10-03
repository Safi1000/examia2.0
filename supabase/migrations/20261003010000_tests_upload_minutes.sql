-- Extra minutes after the writing time runs out, for photographing and
-- uploading the answer sheets. 0 = no upload window (submit when time is up).
alter table public.tests
  add column if not exists upload_minutes integer not null default 0
  check (upload_minutes >= 0);
