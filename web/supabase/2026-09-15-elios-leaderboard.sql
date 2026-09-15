-- Leaderboard for "Fly where people can't" — the waiting-room game that also
-- fills the pause while a mail draft generates.
--
-- One row per player, holding their BEST score only. The route upserts it and
-- refuses anything that is not an improvement, so the table is a high-score
-- board rather than a log of every crash.
--
-- `first_name` is stored rather than joined at read time for two reasons: the
-- board is rendered for everyone in the workspace, and reading other people's
-- names out of `auth.users` needs the service-role key — which would mean the
-- leaderboard could never be a plain authenticated select. Storing the one
-- field the board actually shows keeps the read simple and shares nothing else.
-- It is derived from the session server-side, never from the request body.
--
-- HONEST LIMITATION: the score is produced in the player's browser and posted
-- to us, so it can be forged by anyone who opens devtools. This is a board for
-- a team of colleagues and nothing depends on it. The check constraint below
-- keeps a joke value from sitting at the top forever; it does not make cheating
-- impossible, and it is not trying to.

create table if not exists public.elios_scores (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- First name only. The board is a wall display, not a directory.
  first_name text not null,
  score integer not null check (score > 0 and score <= 999),
  -- When this best was set; the board breaks ties by who got there first.
  achieved_at timestamptz not null default now()
);

create index if not exists elios_scores_rank_idx
  on public.elios_scores (score desc, achieved_at asc);

alter table public.elios_scores enable row level security;
alter table public.elios_scores force row level security;

revoke all on table public.elios_scores from anon, authenticated;

-- Everyone signed in can read the board — that is the whole point of it.
grant select on table public.elios_scores to authenticated;

create policy "elios_scores_select_authed"
  on public.elios_scores
  for select
  to authenticated
  using (true);

-- No insert or update policy on purpose. Writes go through
-- POST /api/elios-score on the service-role client, which derives both the
-- user and the name from the session and only records an improvement. Letting
-- clients write directly would mean trusting a posted name as well as a posted
-- score, and someone could then enter the board as anybody.
