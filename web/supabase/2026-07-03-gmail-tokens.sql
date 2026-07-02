-- Server-side storage for Gmail OAuth refresh tokens.
--
-- The Gmail refresh token (scopes gmail.compose + spreadsheets.readonly) was
-- previously stored in Supabase `user_metadata`, which is embedded in the
-- user's JWT and therefore readable by client-side JS. That is a secret-
-- exposure risk (T0.2). This table moves the refresh token server-side.
--
-- Service-role only: read and written exclusively through the server routes
-- via the service key (see `src/lib/gmail-tokens.ts`), so RLS is forced on and
-- grants are revoked from anon/authenticated (mirrors `admin_audit_log` /
-- `workspace_settings`).
--
-- `gmail_email` is NOT secret (the UI may display it) and remains in
-- user_metadata for display; it is also stored here so create-draft can read
-- it server-side if needed.

create table if not exists public.gmail_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  refresh_token text not null,
  gmail_email text,
  updated_at timestamptz not null default now()
);

alter table public.gmail_tokens enable row level security;
alter table public.gmail_tokens force row level security;

revoke all on table public.gmail_tokens from anon;
revoke all on table public.gmail_tokens from authenticated;

-- Backfill: copy existing refresh tokens out of user_metadata into the table,
-- then strip the secret from user_metadata. `gmail_email` is left in metadata.
insert into public.gmail_tokens (user_id, refresh_token, gmail_email)
  select id, raw_user_meta_data->>'gmail_refresh_token', raw_user_meta_data->>'gmail_email'
  from auth.users
  where raw_user_meta_data ? 'gmail_refresh_token'
  on conflict (user_id) do update
    set refresh_token = excluded.refresh_token, gmail_email = excluded.gmail_email;

update auth.users
  set raw_user_meta_data = raw_user_meta_data - 'gmail_refresh_token'
  where raw_user_meta_data ? 'gmail_refresh_token';
