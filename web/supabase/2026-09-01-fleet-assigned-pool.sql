-- Fleet: separate the bookable POOL from fixed ASSIGNMENTS.
--
-- Run after `2026-09-01-fleet-holder-claims.sql`.
--
-- Why: most of the fleet is not up for grabs. 22 of 41 units are permanently
-- with a person, a region or a customer — Wataru's two in Japan, the three FPS
-- drones, the customer units at Techitop and Terra. Rendering those as rows in
-- a booking calendar is noise: nobody can book them, and 22 uninteresting rows
-- buried the 16 that are actually available.
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
-- Backfill: everything the sheet says is already out is an assignment
-- ---------------------------------------------------------------------------
--
-- Deliberately keyed on `status = 'out'` rather than on having a holder name.
-- Five of the out units name nobody ("EMEA", "China (unidentified)") — those
-- are exactly the ones worth chasing, and they would be lost if the rule were
-- "has a holder". They land in the Assigned tab flagged as unknown.
--
-- Guarded so a re-run cannot re-assign a unit somebody has since returned to
-- the pool: only rows still marked `out` are touched, and returning to the pool
-- sets the status back to `available`.

update public.fleet_assets
set pooled = false
where active
  and status = 'out'
  and pooled;
