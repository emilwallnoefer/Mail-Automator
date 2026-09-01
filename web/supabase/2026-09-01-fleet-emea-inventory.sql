-- Fleet: replace the inventory with the EMEA fleet list. No more, no less.
--
-- Run after `2026-09-01-fleet-remove-us-material.sql`.
--
-- The units seeded from the old fleet-management sheet were the wrong fleet:
-- global Elios 3 stock, much of it retired, customer-owned or American, and
-- missing the LIDAR / RAD / UT / LEL payloads and tethers entirely — which is
-- why the 2024 bookings referenced equipment that did not exist here.
--
-- This is the EMEA list as it actually stands: 31 items in seven groups. It is
-- a full replacement, so the table is emptied first. Anything not on this list
-- is gone by design.
--
-- "ASSIGNED (name)"  -> pooled = false, status 'out', holder recorded.
--                       Lives in the Assigned tab, never in the calendar.
-- "BOOK IN TABLE"    -> pooled = true, status 'available'.
--                       This is the bookable pool the calendar renders.
--
-- Safe to re-run: it truncates and rebuilds, so the result is the same list
-- every time. Re-running DOES discard bookings made in the app, so do not run
-- it casually once people are using the module.

-- ---------------------------------------------------------------------------
-- Categories for the equipment types the old list did not have
-- ---------------------------------------------------------------------------

alter table public.fleet_assets
  drop constraint if exists fleet_assets_category_check;
alter table public.fleet_assets
  add constraint fleet_assets_category_check
  check (category in (
    'drone', 'lidar', 'rad_payload', 'ut_payload', 'lel_payload',
    'dummy_drone', 'tether',
    -- Kept so older rows and any future REx/GCS entries still validate.
    'range_extender', 'gcs', 'accessory', 'other'
  ));

-- ---------------------------------------------------------------------------
-- Full replacement
-- ---------------------------------------------------------------------------
--
-- Reservations cascade from fleet_assets, but delete them explicitly first so
-- the intent is visible rather than implied by a foreign key.

delete from public.fleet_reservations;
delete from public.fleet_asset_events;
delete from public.fleet_assets;

insert into public.fleet_assets
  (name, serial_number, category, model, owner_group, status, pooled,
   home_location, current_location, current_holder_label, notes)
values
  -- DRONE FLEET EMEA -------------------------------------------------------
  ('SVA-330',    null, 'drone', 'Elios 3', 'EMEA', 'out',       false, 'EMEA', 'With Charles', 'Charles', null),
  ('SVA-346',    null, 'drone', 'Elios 3', 'EMEA', 'out',       false, 'EMEA', 'With Tiago',   'Tiago',   null),
  ('E3R-409',    null, 'drone', 'Elios 3', 'EMEA', 'out',       false, 'EMEA', 'With Philipp', 'Philipp', null),
  ('E3R-414',    null, 'drone', 'Elios 3', 'EMEA', 'out',       false, 'EMEA', 'With Emil',    'Emil',    null),
  ('DV2-4',      null, 'drone', 'Elios 3', 'EMEA', 'out',       false, 'EMEA', 'With Lucas',   'Lucas',   null),
  ('SV9-68',     null, 'drone', 'Elios 3', 'EMEA', 'out',       false, 'EMEA', 'With Camilla', 'Camilla', null),
  ('SVA-257',    null, 'drone', 'Elios 3', 'EMEA', 'available', true,  'EMEA', 'EMEA', null, null),

  -- LIDAR REV 7 EMEA -------------------------------------------------------
  -- Serial is the sheet's full number; the name uses the short id people say
  -- out loud ("Rev 7 181"), which is also how the booking calendar wrote them.
  ('REV 7 073', '1223240002073', 'lidar', 'LiDAR Rev 7', 'EMEA', 'out',       false, 'EMEA', 'With Fabio',   'Fabio',   null),
  ('REV 7 158', '122324000158',  'lidar', 'LiDAR Rev 7', 'EMEA', 'out',       false, 'EMEA', 'With Igor',    'Igor',    null),
  ('REV 7 947', '122602002947',  'lidar', 'LiDAR Rev 7', 'EMEA', 'out',       false, 'EMEA', 'With Emil',    'Emil',    null),
  ('REV 7 108', '122448001108',  'lidar', 'LiDAR Rev 7', 'EMEA', 'out',       false, 'EMEA', 'With Tiago',   'Tiago',   null),
  ('REV 7 181', '122328001181',  'lidar', 'LiDAR Rev 7', 'EMEA', 'available', true,  'EMEA', 'EMEA', null, null),
  ('REV 7 519', '122448001519',  'lidar', 'LiDAR Rev 7', 'EMEA', 'available', true,  'EMEA', 'EMEA', null, null),

  -- RAD PAYLOAD EMEA -------------------------------------------------------
  ('RAD 27', '2003627', 'rad_payload', 'RAD payload', 'EMEA', 'out',       false, 'EMEA', 'With Fabio', 'Fabio', null),
  -- The sheet marks 45 both "in repair" and "book in table". Kept as in-repair,
  -- which keeps it out of the calendar until it is actually serviceable —
  -- flip `status` to 'available' when it is back.
  ('RAD 45', '2001545', 'rad_payload', 'RAD payload', 'EMEA', 'in_repair', true,  'EMEA', 'EMEA', null, 'In repair (per fleet sheet)'),
  ('RAD 42', '2001542', 'rad_payload', 'RAD payload', 'EMEA', 'available', true,  'EMEA', 'EMEA', null, null),

  -- UT PAYLOAD EMEA --------------------------------------------------------
  ('UT-03', null, 'ut_payload', 'UT payload', 'EMEA', 'out',       false, 'EMEA', 'With Igor',    'Igor',    null),
  ('UT-09', null, 'ut_payload', 'UT payload', 'EMEA', 'out',       false, 'EMEA', 'With Philipp', 'Philipp', null),
  ('UT-07', null, 'ut_payload', 'UT payload', 'EMEA', 'out',       false, 'EMEA', 'With Emil',    'Emil',    null),
  ('UT-06', null, 'ut_payload', 'UT payload', 'EMEA', 'available', true,  'EMEA', 'EMEA', null, null),

  -- LEL PAYLOAD EMEA -------------------------------------------------------
  ('LEL-218', null, 'lel_payload', 'LEL payload', 'EMEA', 'available', true, 'EMEA', 'EMEA', null, null),
  ('LEL-233', null, 'lel_payload', 'LEL payload', 'EMEA', 'available', true, 'EMEA', 'EMEA', null, null),
  ('LEL-234', null, 'lel_payload', 'LEL payload', 'EMEA', 'available', true, 'EMEA', 'EMEA', null, null),

  -- DUMMY DRONES EMEA ------------------------------------------------------
  ('E3R-XXX', null, 'dummy_drone', 'Dummy drone', 'EMEA', 'out',       false, 'EMEA', 'Total Energies', 'Total Energies', null),
  ('SVA-X',   null, 'dummy_drone', 'Dummy drone', 'EMEA', 'available', true,  'EMEA', 'EMEA', null, null),

  -- TETHER -----------------------------------------------------------------
  ('LL1-8',  null, 'tether', 'Tether', 'EMEA', 'available', true,  'EMEA', 'EMEA', null, null),
  ('LL2-6',  null, 'tether', 'Tether', 'EMEA', 'available', true,  'EMEA', 'EMEA', null, null),
  ('LL2-8',  null, 'tether', 'Tether', 'EMEA', 'available', true,  'EMEA', 'EMEA', null, null),
  ('LL2-7',  null, 'tether', 'Tether', 'EMEA', 'out',       false, 'EMEA', 'With Igor', 'Igor', 'Permanently with Igor'),
  ('LL2-9',  null, 'tether', 'Tether', 'EMEA', 'out',       false, 'EMEA', 'USA',       'USA',  'Indefinitely in the USA'),
  ('LL2-10', null, 'tether', 'Tether', 'EMEA', 'out',       false, 'EMEA', 'USA',       'USA',  'Indefinitely in the USA');

-- ---------------------------------------------------------------------------
-- No placeholder bookings for assigned units
-- ---------------------------------------------------------------------------
--
-- An earlier version of this file created one open reservation per assigned
-- unit, dated current_date .. +30, so the Assigned tab had something to hold.
-- That was fabricated data: the window was a guess, and it collided with the
-- real roadshow bookings under the no-double-booking constraint.
--
-- It is not needed. The Assigned tab reads `pooled` and `current_holder_label`
-- straight off the asset, and `claim_holder` links assets by holder name as
-- well as by reservation — so claiming "Igor Stapper" still picks up his kit.
