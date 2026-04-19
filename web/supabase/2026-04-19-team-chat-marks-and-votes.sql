-- Team Chat extensions:
--   1. Tag a message as `feature_request`, `change_request`, or `best_practice`.
--   2. Edit / delete your own messages.
--   3. Up/down votes on feature & change requests (any authed user, one vote each).
--   4. Admins can mark feature/change requests as "done" so they drop out of
--      the filtered request lists. Done flag is set via service-role API
--      (`/api/chat/mark-done`) so we don't need an admin-aware RLS check here.
--
-- Run after `2026-04-19-team-chat.sql`.

-- ---------- chat_messages: new columns ----------------------------------
alter table public.chat_messages
  add column if not exists kind text not null default 'message',
  add column if not exists done_at timestamptz,
  add column if not exists done_by uuid references auth.users (id) on delete set null,
  add column if not exists edited_at timestamptz;

alter table public.chat_messages
  drop constraint if exists chat_messages_kind_check;
alter table public.chat_messages
  add constraint chat_messages_kind_check
  check (kind in ('message', 'feature_request', 'change_request', 'best_practice'));

-- Speeds up the filtered-by-kind queries used by the widget.
create index if not exists idx_chat_messages_kind_created
  on public.chat_messages (kind, created_at desc)
  where kind <> 'message';

-- Realtime UPDATE/DELETE events need the full old row to be replicated so the
-- client can identify which row changed (default identity is just the PK,
-- which is fine for inserts but loses old column values on updates).
alter table public.chat_messages replica identity full;

-- ---------- chat_messages: edit / delete policies + column grants -------
-- Existing policies (from the previous migration) cover SELECT and INSERT.
-- We add UPDATE and DELETE now, restricted to the message author.
--
-- IMPORTANT: marking a message as done is performed by the admin API using
-- the service-role key, which bypasses RLS. That's why the UPDATE policy
-- here only needs to allow the author. We further restrict the columns the
-- author may UPDATE via column-level grants below, so a user CAN'T flip
-- `done_at` / `done_by` / `kind` on their own row through the anon key.

drop policy if exists "chat_messages_update_own" on public.chat_messages;
create policy "chat_messages_update_own"
  on public.chat_messages for update
  to authenticated
  using (auth.uid() = sender_id)
  with check (auth.uid() = sender_id);

drop policy if exists "chat_messages_delete_own" on public.chat_messages;
create policy "chat_messages_delete_own"
  on public.chat_messages for delete
  to authenticated
  using (auth.uid() = sender_id);

-- Column-level UPDATE grant: authors can only change body + edited_at.
-- (Admins write done_at / done_by via the service-role key.)
revoke update on table public.chat_messages from authenticated;
grant update (body, edited_at) on table public.chat_messages to authenticated;
grant delete on table public.chat_messages to authenticated;

-- ---------- chat_message_votes ------------------------------------------
create table if not exists public.chat_message_votes (
  message_id uuid not null references public.chat_messages (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  vote smallint not null check (vote in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index if not exists idx_chat_message_votes_message
  on public.chat_message_votes (message_id);

alter table public.chat_message_votes enable row level security;
alter table public.chat_message_votes force row level security;
alter table public.chat_message_votes replica identity full;

revoke all on table public.chat_message_votes from anon;
revoke all on table public.chat_message_votes from authenticated;
grant select, insert, update, delete on table public.chat_message_votes to authenticated;

drop policy if exists "votes_select_authed" on public.chat_message_votes;
create policy "votes_select_authed"
  on public.chat_message_votes for select
  to authenticated
  using (true);

drop policy if exists "votes_insert_own" on public.chat_message_votes;
create policy "votes_insert_own"
  on public.chat_message_votes for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "votes_update_own" on public.chat_message_votes;
create policy "votes_update_own"
  on public.chat_message_votes for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "votes_delete_own" on public.chat_message_votes;
create policy "votes_delete_own"
  on public.chat_message_votes for delete
  to authenticated
  using (auth.uid() = user_id);

-- Add votes table to realtime publication (idempotent).
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_message_votes'
  ) then
    execute 'alter publication supabase_realtime add table public.chat_message_votes';
  end if;
end
$$;
