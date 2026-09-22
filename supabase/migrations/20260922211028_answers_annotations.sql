-- Grader markup over submitted answer images, keyed by image URL.
-- Shapes are stored in each image's own pixel coordinates.
alter table public.answers
  add column if not exists annotations jsonb not null default '{}'::jsonb;
