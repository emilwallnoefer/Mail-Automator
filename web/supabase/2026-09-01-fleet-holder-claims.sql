-- Fleet: bookings that belong to a NAME before they belong to an account.
--
-- Run after `2026-09-01-fleet-management.sql`.
--
-- Why: the sheet says 22 units are out, and names who has them ("Wataru",
-- "Charles", "APAC team") — but those are free text, not accounts. Until now a
-- reservation required a `user_id`, so none of that could be represented and
-- every out unit was invisible to the module: no reminder, no accountability,
-- just a location string.
--
-- This migration lets a reservation carry `holder_label` instead of a user, and
-- adds a claim step: when that person signs in, they take ownership of every
-- booking filed under their name and it becomes a normal reservation.
--
-- Three deliberate safety properties, so importing the sheet cannot punish
-- anyone for records they never created:
--
--   1. An UNCLAIMED booking can never send a reminder — there is no address to
--      mail. That falls out of the data, not a flag.
--   2. `source = 'sheet_import'` rows are EXCLUDED from the reliability score.
--      You do not get marked unreliable for a row a migration wrote. They still
--      hold the asset on the calendar and still check in normally.
--   3. Reminders are globally OFF until someone turns them on (fleet_settings).
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Reservations: a holder can be a name instead of an account
-- ---------------------------------------------------------------------------

alter table public.fleet_reservations
  alter column user_id drop not null;

alter table public.fleet_reservations
  add column if not exists holder_label text;

-- 'app'          — created through the UI by a real person.
-- 'sheet_import' — carried over from the fleet-management sheet. Provisional:
--                  excluded from scoring, and shown as such in the UI.
alter table public.fleet_reservations
  add column if not exists source text not null default 'app';

alter table public.fleet_reservations
  drop constraint if exists fleet_reservations_source_check;
alter table public.fleet_reservations
  add constraint fleet_reservations_source_check
  check (source in ('app', 'sheet_import'));

-- A booking must be attributable to someone, even if only by name.
alter table public.fleet_reservations
  drop constraint if exists fleet_reservations_holder_present;
alter table public.fleet_reservations
  add constraint fleet_reservations_holder_present
  check (user_id is not null or holder_label is not null);

create index if not exists fleet_reservations_unclaimed_idx
  on public.fleet_reservations (holder_label)
  where user_id is null;

-- ---------------------------------------------------------------------------
-- Name -> account mapping
-- ---------------------------------------------------------------------------
--
-- Kept after a claim so a LATER import of the same name resolves straight to
-- the account, instead of asking the same person to claim "Charles" again.

create table if not exists public.fleet_holder_aliases (
  -- Lower-cased, trimmed holder label. Case-insensitive by construction rather
  -- than by citext, which is not enabled on this project.
  label text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  claimed_at timestamptz not null default now(),
  -- Who performed the mapping: the person themselves, or an admin.
  claimed_by uuid references auth.users (id) on delete set null
);

create index if not exists fleet_holder_aliases_user_idx
  on public.fleet_holder_aliases (user_id);

-- ---------------------------------------------------------------------------
-- Module settings (single row)
-- ---------------------------------------------------------------------------

create table if not exists public.fleet_settings (
  -- Single-row table: the primary key can only ever be true.
  id boolean primary key default true,
  -- Reminders start OFF. The imported bookings are provisional and their due
  -- dates are guesses, so mailing people about them on day one would train
  -- everyone to ignore the reminder before it ever carried a real one.
  reminders_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint fleet_settings_single_row check (id)
);

insert into public.fleet_settings (id) values (true) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.fleet_holder_aliases enable row level security;
alter table public.fleet_holder_aliases force row level security;
alter table public.fleet_settings enable row level security;
alter table public.fleet_settings force row level security;

revoke all on table public.fleet_holder_aliases from anon, authenticated;
revoke all on table public.fleet_settings from anon, authenticated;

-- Written only by the service-role client behind /api/fleet. Note that claiming
-- a name is deliberately PERMISSIVE, not restricted to your own: the sheet this
-- data came from spelled people inconsistently, so a strict name match would
-- strand exactly the people the flow exists to onboard. The route records
-- whether the label matched the claimant, mails the admins when it did not, and
-- Admin → Holder claims lets an admin reassign or release the name. See
-- 2026-09-15-fleet-claim-oversight.sql, which also withdraws the `select` grant
-- below on fleet_holder_aliases — no client ever used it, and the oversight
-- columns it adds are not everyone's business.
grant select on table public.fleet_holder_aliases to authenticated;
grant select on table public.fleet_settings to authenticated;

drop policy if exists "fleet_holder_aliases_select_all" on public.fleet_holder_aliases;
create policy "fleet_holder_aliases_select_all"
  on public.fleet_holder_aliases for select to authenticated using (true);

drop policy if exists "fleet_settings_select_all" on public.fleet_settings;
create policy "fleet_settings_select_all"
  on public.fleet_settings for select to authenticated using (true);

drop trigger if exists fleet_settings_touch on public.fleet_settings;
create trigger fleet_settings_touch
  before update on public.fleet_settings
  for each row execute function public.fleet_touch_updated_at();

-- ---------------------------------------------------------------------------
-- No import
-- ---------------------------------------------------------------------------
--
-- This file used to open a booking for every unit the spreadsheet said was out.
-- That import has been removed along with the rest of the sheet data; the
-- structure above is what matters — a reservation can be filed under a NAME
-- before that person has an account, which is what makes the claim flow work
-- for anyone added later.
