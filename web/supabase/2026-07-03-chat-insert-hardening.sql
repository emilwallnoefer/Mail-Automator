-- Chat INSERT hardening — SECURITY.md T0.5 (MEDIUM).
--
-- The `chat_messages` INSERT policy only enforces `auth.uid() = sender_id`,
-- but `authenticated` holds a table-wide INSERT grant and `sender_email` is a
-- free-text column the UI renders as each message's displayed name/avatar. A
-- user inserting directly (bypassing the app helper in `src/lib/chat.ts`)
-- could set a truthful `sender_id` but a *spoofed* `sender_email`, forging a
-- colleague's or admin's identity. The same direct insert could also pre-set
-- the moderation columns `done_at` / `done_by`, which are only column-
-- restricted on UPDATE (via the marks-and-votes migration), not on INSERT.
--
-- Fix: a BEFORE INSERT trigger that server-side stamps `sender_email` from the
-- authenticated JWT and forces the moderation fields to safe values, so any
-- client-supplied spoofed value is ignored. `kind` is intentionally left
-- untouched — it is a legitimate user-chosen field (message / feature_request
-- / change_request / best_practice), not a privilege, and the app sets it at
-- insert time. Apply by hand in the Supabase SQL Editor like the other
-- migrations. Run after `2026-04-19-team-chat-marks-and-votes.sql`.

-- Stamp sender_email from the JWT and neutralize client-supplied moderation
-- fields on INSERT, so a user cannot forge another person's identity or
-- pre-set done_at/done_by/kind. Runs with definer rights; auth.jwt() is
-- available in the request context. Apply by hand like the other migrations.
create or replace function public.chat_messages_stamp_identity()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_catalog
as $$
begin
  -- Bind the displayed identity to the authenticated user; ignore client value.
  new.sender_email := coalesce(nullif(auth.jwt() ->> 'email', ''), new.sender_email);
  -- Moderation is set only by the admin mark-done route (service role),
  -- never at insert time by a client.
  new.done_at := null;
  new.done_by := null;
  return new;
end;
$$;

drop trigger if exists chat_messages_stamp on public.chat_messages;
create trigger chat_messages_stamp
  before insert on public.chat_messages
  for each row execute function public.chat_messages_stamp_identity();
