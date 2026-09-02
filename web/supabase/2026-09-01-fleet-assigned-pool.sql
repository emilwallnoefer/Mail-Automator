-- Fleet: separate the bookable POOL from fixed ASSIGNMENTS.
--
-- Run after `2026-09-01-fleet-holder-claims.sql`.
--
-- Why: much of a fleet is not up for grabs — units live permanently with a
-- person, a region or a customer. Rendering those as rows in a booking calendar
-- is noise: nobody can book them, and they bury the ones that are actually
-- available.
--
-- `pooled` splits the two:
--   true  — part of the shared pool. Appears in the calendar, can be booked.
--   false — assigned to someone. Appears in the Assigned tab, not the calendar.
--
-- This is a property of the ASSET, not of a booking: it answers "is this unit
-- something the team shares?", which does not change when one booking ends.
-- An assigned unit rejoins the pool through the app's "Return to pool" action
-- (or an admin flipping it back), which is a deliberate act.
--
-- Safe to re-run.

alter table public.fleet_assets
  add column if not exists pooled boolean not null default true;

comment on column public.fleet_assets.pooled is
  'True when the unit belongs to the shared bookable pool and appears in the calendar. False when it is assigned to a person, region or customer.';

-- The calendar reads this on every load: pooled units that are not retired or
-- in repair.
create index if not exists fleet_assets_pooled_idx
  on public.fleet_assets (pooled, status, category, name)
  where active;

-- ---------------------------------------------------------------------------
-- Backfill: anything already marked out is an assignment
-- ---------------------------------------------------------------------------
--
-- A no-op on a fresh install (the tables start empty). It exists for the case
-- where units were added before this column did.
--
-- Deliberately keyed on `status = 'out'` rather than on having a holder name: a
-- unit that is out with nobody recorded is exactly the one worth chasing, and a
-- "has a holder" rule would quietly skip it. Those land in the Assigned tab
-- flagged as unknown.
--
-- Guarded so a re-run cannot re-assign a unit somebody has since returned to
-- the pool: only rows still marked `out` are touched, and returning to the pool
-- sets the status back to `available`.

update public.fleet_assets
set pooled = false
where active
  and status = 'out'
  and pooled;
