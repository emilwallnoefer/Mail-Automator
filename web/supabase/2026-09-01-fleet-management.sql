-- Fleet module: material tracking + day-level reservations + reliability score.
--
-- Replaces the shared "Fleet management" Google Sheet, which nobody kept
-- current: bookings lived in a merged-cell grid, the location was free text
-- ("US office", "Perdu par Johan Donzé") that went stale invisibly, and nothing
-- ever told anyone their material was overdue.
--
-- Schema only. The material list is entered through the app (Fleet -> Manage),
-- not seeded here.
--
-- Three tables:
--   fleet_assets        — one row per physical item, carrying its CURRENT location.
--   fleet_reservations  — a booking over an inclusive run of calendar days.
--   fleet_asset_events  — append-only movement/audit trail for an asset.
--
-- The reliability score is NOT stored: it is derived from fleet_reservations by
-- `web/src/lib/fleet-rules.ts` so there is one implementation and no field that
-- can drift out of sync with the history it summarises.
--
-- Apply by hand in the Supabase SQL Editor, like the other migrations in this
-- directory. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Assets
-- ---------------------------------------------------------------------------

create table if not exists public.fleet_assets (
  id uuid primary key default gen_random_uuid(),
  -- Manufacturer serial. Unique when present; some legacy units have none.
  serial_number text,
  -- Short internal handle used in conversation ("E3-DV1-2", "SVA-330").
  name text not null,
  -- 'drone' | 'range_extender' | 'gcs' | 'accessory' | 'other'
  category text not null default 'drone',
  model text,
  -- Which group the unit belongs to (Sales, Marketing, R&D, Customer, ...).
  owner_group text,
  -- 'available' | 'reserved' | 'out' | 'in_repair' | 'retired'
  status text not null default 'available',
  -- Where the item lives when nobody has it out.
  home_location text,
  -- Where it is RIGHT NOW. The question the spreadsheet could never answer.
  current_location text,
  -- Set while the item is physically out; cleared on check-in.
  current_holder_user_id uuid references auth.users (id) on delete set null,
  -- Free-text holder for people without an account (customer, partner, office).
  current_holder_label text,
  -- Last time a human confirmed the location, for the staleness pill.
  location_confirmed_at timestamptz,
  notes text,
  -- Retired units stay in the table for history but drop out of the calendar.
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fleet_assets_category_check
    check (category in ('drone', 'range_extender', 'gcs', 'accessory', 'other')),
  constraint fleet_assets_status_check
    check (status in ('available', 'reserved', 'out', 'in_repair', 'retired'))
);

-- Partial unique index, not a column constraint: several legacy units have no
-- serial at all, and NULLs must not collide with each other.
create unique index if not exists fleet_assets_serial_unique
  on public.fleet_assets (serial_number)
  where serial_number is not null;

create index if not exists fleet_assets_active_idx on public.fleet_assets (active, category, name);

-- ---------------------------------------------------------------------------
-- Reservations
-- ---------------------------------------------------------------------------

create table if not exists public.fleet_reservations (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.fleet_assets (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Inclusive calendar days: a one-day booking has start_date = end_date, and
  -- end_date IS the due date. Bookings are per-day rather than per-week because
  -- most missions are two or three days, and rounding those up to a whole week
  -- made the old sheet look fully booked while half the fleet sat on a shelf.
  start_date date not null,
  end_date date not null,
  -- 'reserved' | 'waitlisted' | 'picked_up' | 'returned' | 'cancelled'
  status text not null default 'reserved',
  purpose text,
  -- Where the material is going, so the fleet stays locatable while it is out.
  destination text,
  picked_up_at timestamptz,
  returned_at timestamptz,
  -- Date the item actually came back, in Europe/Zurich terms. Scoring reads
  -- this rather than returned_at so a late-evening check-in is not pushed onto
  -- the next day by UTC.
  returned_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fleet_reservations_status_check
    check (status in ('reserved', 'waitlisted', 'picked_up', 'returned', 'cancelled')),
  constraint fleet_reservations_date_order check (end_date >= start_date),
  -- Twelve weeks. Anything longer is a transfer, not a booking, and should move
  -- the asset's home location instead. Mirrors MAX_RESERVATION_DAYS in
  -- web/src/lib/fleet-rules.ts.
  constraint fleet_reservations_max_length check (end_date - start_date <= 83)
);

create index if not exists fleet_reservations_asset_window_idx
  on public.fleet_reservations (asset_id, start_date, end_date);
create index if not exists fleet_reservations_user_idx
  on public.fleet_reservations (user_id, status);
-- The overdue sweep scans live bookings by due date.
create index if not exists fleet_reservations_live_idx
  on public.fleet_reservations (status, end_date)
  where status in ('reserved', 'picked_up');

-- Hard guarantee that two people cannot hold the same asset on the same day.
-- The API checks this too (for a friendly error), but the constraint is what
-- makes it true under concurrent requests — two simultaneous bookings for
-- overlapping days would both pass an application-level read and then collide
-- here. '[]' makes the range inclusive at both ends, matching how the app reads
-- start_date/end_date, so back-to-back bookings (one ends Wed, the next starts
-- Thu) do not collide while a shared day does.
create extension if not exists btree_gist;

alter table public.fleet_reservations
  drop constraint if exists fleet_reservations_no_double_booking;
alter table public.fleet_reservations
  add constraint fleet_reservations_no_double_booking
  exclude using gist (
    asset_id with =,
    daterange(start_date, end_date, '[]') with &&
  )
  where (status in ('reserved', 'picked_up'));

-- ---------------------------------------------------------------------------
-- Movement / audit trail
-- ---------------------------------------------------------------------------

create table if not exists public.fleet_asset_events (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.fleet_assets (id) on delete cascade,
  reservation_id uuid references public.fleet_reservations (id) on delete set null,
  -- 'created' | 'checked_out' | 'checked_in' | 'moved' | 'location_confirmed'
  --   | 'status_changed' | 'reserved' | 'cancelled' | 'note'
  kind text not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  from_location text,
  to_location text,
  note text,
  created_at timestamptz not null default now(),
  constraint fleet_asset_events_kind_check
    check (kind in ('created', 'checked_out', 'checked_in', 'moved', 'location_confirmed',
                    'status_changed', 'reserved', 'cancelled', 'note'))
);

create index if not exists fleet_asset_events_asset_idx
  on public.fleet_asset_events (asset_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Reminder audit (one row per email actually sent)
-- ---------------------------------------------------------------------------

create table if not exists public.fleet_reminder_sends (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.fleet_reservations (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  -- 'due_soon' | 'due_today' | 'overdue'
  kind text not null,
  sent_for_date date not null,
  email text,
  status text not null default 'sent',
  error text,
  created_at timestamptz not null default now()
);

-- The cron gate: at most one reminder per reservation per kind per day, so a
-- retry or a double cron invocation cannot mail the same person twice.
create unique index if not exists fleet_reminder_sends_once_per_day
  on public.fleet_reminder_sends (reservation_id, kind, sent_for_date);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.fleet_assets enable row level security;
alter table public.fleet_assets force row level security;
alter table public.fleet_reservations enable row level security;
alter table public.fleet_reservations force row level security;
alter table public.fleet_asset_events enable row level security;
alter table public.fleet_asset_events force row level security;
alter table public.fleet_reminder_sends enable row level security;
alter table public.fleet_reminder_sends force row level security;

revoke all on table public.fleet_assets from anon, authenticated;
revoke all on table public.fleet_reservations from anon, authenticated;
revoke all on table public.fleet_asset_events from anon, authenticated;
revoke all on table public.fleet_reminder_sends from anon, authenticated;

-- The fleet is shared property: everyone signed in may see every asset and
-- every booking. That visibility is the point — the score and the queue only
-- work if you can see who has what.
grant select on table public.fleet_assets to authenticated;
grant select on table public.fleet_reservations to authenticated;
grant select on table public.fleet_asset_events to authenticated;

drop policy if exists "fleet_assets_select_all" on public.fleet_assets;
create policy "fleet_assets_select_all"
  on public.fleet_assets for select to authenticated using (true);

drop policy if exists "fleet_reservations_select_all" on public.fleet_reservations;
create policy "fleet_reservations_select_all"
  on public.fleet_reservations for select to authenticated using (true);

drop policy if exists "fleet_asset_events_select_all" on public.fleet_asset_events;
create policy "fleet_asset_events_select_all"
  on public.fleet_asset_events for select to authenticated using (true);

-- No INSERT/UPDATE/DELETE grants for `authenticated` anywhere in this module.
-- Every write goes through /api/fleet on the service-role client, which is the
-- only place that can enforce the horizon, the queue order and the score. A
-- client-side write would let anyone book past their horizon or mark their own
-- overdue item returned.
--
-- fleet_reminder_sends is server-only in both directions: it is cron bookkeeping.

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create or replace function public.fleet_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists fleet_assets_touch on public.fleet_assets;
create trigger fleet_assets_touch
  before update on public.fleet_assets
  for each row execute function public.fleet_touch_updated_at();

drop trigger if exists fleet_reservations_touch on public.fleet_reservations;
create trigger fleet_reservations_touch
  before update on public.fleet_reservations
  for each row execute function public.fleet_touch_updated_at();

-- ---------------------------------------------------------------------------
-- No seed
-- ---------------------------------------------------------------------------
--
-- This file used to seed a fleet imported from the old "Fleet management"
-- spreadsheet. That import has been removed: the material list is now entered
-- and maintained through the app (Fleet -> Manage, admin only), which is the
-- only place it can be kept correct.
--
-- Applying this migration gives you empty tables, ready for the Manage tab.
