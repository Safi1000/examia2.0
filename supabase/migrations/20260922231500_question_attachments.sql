-- Pages of a PDF (or images) attached to a question prompt, already rendered
-- to image URLs so every viewer is a plain <img>.
alter table public.questions
  add column if not exists attachment_urls text[] not null default '{}';
alter table public.question_bank
  add column if not exists attachment_urls text[] not null default '{}';
