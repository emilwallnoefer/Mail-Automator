-- "A new user is waiting for a role" — the once-only admin notice.
--
-- Roles live in `app_metadata` and are written by exactly one place: the
-- guardAdmin()-protected PATCH /api/admin/users. A brand-new account therefore
-- signs in with no role at all and is blocked until an admin assigns one. This
-- table is what tells the admins that somebody is waiting, without mailing them
-- again on every page load that roleless user makes.
--
-- The once-only gate is the PRIMARY KEY on `user_id`. The notifier INSERTs the
-- row BEFORE it calls Resend: if the insert loses (the row is already there),
-- somebody has already been told and we must not send again. Two concurrent
-- tabs of the same new sign-in race on the same key and exactly one of them
-- wins. This is the same claim-before-send shape as `fleet_reminder_sends`,
-- where a unique index carries the guarantee.
--
-- A `status = 'failed'` row is deliberately NOT retried: the user stays blocked
-- (which is the safe state) and the admin can still see them in
-- Admin -> Users & roles. Delete the row by hand to re-arm the notice.
--
-- Writes only ever happen with the service-role key from the server, so no
-- grant is given back to anon/authenticated at all — the table is invisible to
-- end users.

create table if not exists public.role_assignment_notices (
  -- One row per account, and the primary key IS the send-once gate.
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  recipients text[] not null default '{}',
  message_id text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_role_assignment_notices_created_at
  on public.role_assignment_notices (created_at desc);

alter table public.role_assignment_notices enable row level security;
alter table public.role_assignment_notices force row level security;

revoke all on table public.role_assignment_notices from anon, authenticated;

-- No grants back: `authenticated` gets neither read nor write. Nothing in the
-- UI reads this table; the admin's source of truth for "who needs a role" stays
-- the user list in Admin -> Users & roles.
