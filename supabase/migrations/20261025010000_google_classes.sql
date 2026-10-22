-- Google automation for live classes: Hamza connects his Google account once,
-- then the server makes each class's Meet link every morning (Google Calendar)
-- and picks up the recording from Drive after class.
--
--   google_account  the one connected Google account (refresh token). Server
--                   only: no student or browser can read it.
--   class_links     + event_id (the Calendar event behind an automatic link)
--                   + auto (true when the server made the link)

create table if not exists public.google_account (
  id            smallint primary key default 1 check (id = 1),
  email         text,
  refresh_token text not null,
  connected_at  timestamptz not null default now()
);

alter table public.google_account enable row level security;
-- No policies: only the service role (server) reads or writes it.
revoke all on public.google_account from authenticated, anon;

alter table public.class_links
  add column if not exists event_id text,
  add column if not exists auto boolean not null default false;
