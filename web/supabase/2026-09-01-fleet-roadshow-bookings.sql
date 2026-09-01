-- Fleet: the 2026 bookings from the roadshow planning calendar.
--
-- Run after `2026-09-01-fleet-emea-inventory.sql`.
--
-- Source: "Elios 3 - Fleet Management - Roadshow planing 2025", the two-year
-- planning grid. Only 2026 onwards is imported — the 2025 half is history the
-- team does not need, and the older 2024 grid in the other spreadsheet is dead.
--
-- The calendar was reconstructed from the PDF export: each booking is a merged,
-- coloured cell, so its left and right edges give the exact first and last day,
-- and the person is the row block it sits in. The mapping was verified two ways
-- before generating this file — every one of the 730 day columns matches the day
-- number printed above it, and the sheet's own vertical "NEW YEAR" marker lands
-- on 31 December / 1 January.
--
-- 57 bookings, 2026-01-05 to 2026-04-30,
-- across 8 assets and 9 people.
--
-- Every row is:
--   * `holder_label`, not `user_id` — these people have no accounts yet. They
--     stay unclaimed until someone claims their name, which also means they can
--     never trigger a reminder (no address to mail).
--   * `source = 'sheet_import'` — excluded from the reliability score. Nobody
--     should be judged on a record a migration wrote from a spreadsheet.
--   * `status = 'returned'` — all of these ended before today, so they render as
--     muted history in the calendar rather than holding material that is long
--     since back on the shelf.
--
-- Labels naming equipment that is not in the EMEA fleet were left out rather
-- than guessed at; they are listed at the bottom of this file. A booking pinned
-- to the wrong drone is worse than one that is missing.
--
-- Safe to re-run: the insert skips any (asset, holder, start, end) it already has.

insert into public.fleet_reservations
  (asset_id, user_id, holder_label, start_date, end_date, status, returned_on, purpose, source, picked_up_at)
select
  a.id, null, v.holder, v.start_date::date, v.end_date::date, v.status, v.returned_on::date,
  v.label, 'sheet_import', (v.start_date::date + time '09:00') at time zone 'Europe/Zurich'
from (values
  ('UT-06', 'Inga Khchoyan', '2026-01-05', '2026-01-10', 'returned', '2026-01-10', 'UT-06 (Roav7)'),
  ('UT-06', 'Inga Khchoyan', '2026-01-12', '2026-01-17', 'returned', '2026-01-17', 'UT-06 (Roav7)'),
  ('SVA-346', 'Matteo Saglia', '2026-01-19', '2026-01-24', 'returned', '2026-01-24', 'SVA-346'),
  ('LL2-8', 'Emil Wallnofer', '2026-01-21', '2026-01-23', 'returned', '2026-01-23', 'LL2-8 C5 Testing'),
  ('REV 7 181', 'Inga Khchoyan', '2026-01-26', '2026-01-31', 'returned', '2026-01-31', 'REV 7 181'),
  ('REV 7 181', 'Lucas Senault', '2026-02-02', '2026-02-06', 'returned', '2026-02-06', 'REV 7 181'),
  ('REV 7 519', 'Inga Khchoyan', '2026-02-02', '2026-02-06', 'returned', '2026-02-06', 'REV 7 519'),
  ('UT-06', 'Inga Khchoyan', '2026-02-02', '2026-02-06', 'returned', '2026-02-06', 'UT-06'),
  ('LL2-8', 'Matteo Saglia', '2026-02-07', '2026-02-22', 'returned', '2026-02-22', 'Tether LL2-8'),
  ('REV 7 181', 'Lucas Senault', '2026-02-09', '2026-02-14', 'returned', '2026-02-14', 'REV 7 181'),
  ('REV 7 519', 'Inga Khchoyan', '2026-02-09', '2026-02-14', 'returned', '2026-02-14', 'REV 7 519'),
  ('UT-06', 'Inga Khchoyan', '2026-02-09', '2026-02-14', 'returned', '2026-02-14', 'UT-06'),
  ('LL2-6', 'Lucas Senault', '2026-02-16', '2026-02-21', 'returned', '2026-02-21', 'Tether LL2-6'),
  ('RAD 42', 'Inga Khchoyan', '2026-02-16', '2026-02-21', 'returned', '2026-02-21', 'RAD 42 - Engie BE'),
  ('REV 7 181', 'Inga Khchoyan', '2026-02-16', '2026-02-21', 'returned', '2026-02-21', 'REV 7 181 - Drone Eksperten'),
  ('UT-06', 'Lucas Senault', '2026-02-16', '2026-02-21', 'returned', '2026-02-21', 'UT-06'),
  ('SVA-346', 'Matteo Saglia', '2026-02-19', '2026-02-28', 'returned', '2026-02-28', 'SVA-346'),
  ('LL2-8', 'Tiago Leconte Pais', '2026-02-22', '2026-02-28', 'returned', '2026-02-28', 'Tether LL2-8'),
  ('LL2-6', 'Inga Khchoyan', '2026-02-23', '2026-02-28', 'returned', '2026-02-28', 'Tether LL2-6'),
  ('LL2-8', 'Inga Khchoyan', '2026-02-23', '2026-02-28', 'returned', '2026-02-28', 'Tether LL2-8'),
  ('RAD 42', 'Matteo Saglia', '2026-02-23', '2026-03-01', 'returned', '2026-03-01', 'RAD 42 - Engie BE'),
  ('UT-06', 'Philipp Jaegle', '2026-02-23', '2026-03-01', 'returned', '2026-03-01', 'UT-06'),
  ('LL2-6', 'Lucas Senault', '2026-03-02', '2026-03-07', 'returned', '2026-03-07', 'Tether LL2-6'),
  ('LL2-8', 'Inga Khchoyan', '2026-03-02', '2026-03-07', 'returned', '2026-03-07', 'Tether LL2-8'),
  ('LL1-8', 'Lucas Senault', '2026-03-09', '2026-03-14', 'returned', '2026-03-14', 'Tether LL1-8'),
  ('LL2-6', 'Inga Khchoyan', '2026-03-09', '2026-03-14', 'returned', '2026-03-14', 'Tether LL2-6'),
  ('LL2-8', 'Inga Khchoyan', '2026-03-09', '2026-03-14', 'returned', '2026-03-14', 'Tether LL2-8'),
  ('REV 7 181', 'Lucas Senault', '2026-03-09', '2026-03-14', 'returned', '2026-03-14', 'REV 7 181'),
  ('UT-06', 'Lucas Senault', '2026-03-09', '2026-03-14', 'returned', '2026-03-14', 'UT-06'),
  ('LL1-8', 'Lucas Senault', '2026-03-16', '2026-03-21', 'returned', '2026-03-21', 'Tether LL1-8'),
  ('LL2-6', 'Inga Khchoyan', '2026-03-16', '2026-03-21', 'returned', '2026-03-21', 'Tether LL2-6'),
  ('LL2-8', 'Inga Khchoyan', '2026-03-16', '2026-03-21', 'returned', '2026-03-21', 'Tether LL2-8'),
  ('REV 7 181', 'Lucas Senault', '2026-03-16', '2026-03-21', 'returned', '2026-03-21', 'REV 7 181'),
  ('UT-06', 'Lucas Senault', '2026-03-16', '2026-03-21', 'returned', '2026-03-21', 'UT-06'),
  ('LL1-8', 'Inga Khchoyan', '2026-03-23', '2026-03-28', 'returned', '2026-03-28', 'Tether LL1-8'),
  ('LL2-6', 'Inga Khchoyan', '2026-03-23', '2026-03-28', 'returned', '2026-03-28', 'Tether LL2-6'),
  ('LL2-8', 'Lucas Senault', '2026-03-23', '2026-03-28', 'returned', '2026-03-28', 'Tether LL2-8'),
  ('REV 7 181', 'Lucas Senault', '2026-03-23', '2026-03-28', 'returned', '2026-03-28', 'REV 7 181'),
  ('UT-06', 'Lucas Senault', '2026-03-23', '2026-03-28', 'returned', '2026-03-28', 'UT-06'),
  ('LL1-8', 'Lucas Senault', '2026-03-30', '2026-04-04', 'returned', '2026-04-04', 'Tether LL1-8'),
  ('LL2-6', 'Inga Khchoyan', '2026-03-30', '2026-04-04', 'returned', '2026-04-04', 'Tether LL2-6'),
  ('RAD 42', 'Paul Samuel', '2026-03-30', '2026-04-25', 'returned', '2026-04-25', 'RAD 42'),
  ('REV 7 181', 'Lucas Senault', '2026-03-30', '2026-04-04', 'returned', '2026-04-04', 'REV 7 181'),
  ('UT-06', 'Lucas Senault', '2026-03-30', '2026-04-04', 'returned', '2026-04-04', 'UT-06'),
  ('LL1-8', 'Lucas Senault', '2026-04-06', '2026-04-11', 'returned', '2026-04-11', 'Tether LL1-8'),
  ('LL2-6', 'Inga Khchoyan', '2026-04-06', '2026-04-11', 'returned', '2026-04-11', 'Tether LL2-6'),
  ('REV 7 181', 'Lucas Senault', '2026-04-06', '2026-04-11', 'returned', '2026-04-11', 'REV 7 181'),
  ('UT-06', 'Lucas Senault', '2026-04-06', '2026-04-11', 'returned', '2026-04-11', 'UT-06'),
  ('LL1-8', 'Inga Khchoyan', '2026-04-13', '2026-04-18', 'returned', '2026-04-18', 'Tether LL1-8'),
  ('LL2-6', 'Inga Khchoyan', '2026-04-13', '2026-04-18', 'returned', '2026-04-18', 'Tether LL2-6'),
  ('LL1-8', 'Inga Khchoyan', '2026-04-20', '2026-04-25', 'returned', '2026-04-25', 'Tether LL1-8'),
  ('LL2-6', 'Lucas Senault', '2026-04-20', '2026-04-25', 'returned', '2026-04-25', 'Tether LL2-6'),
  ('LL2-8', 'Inga Khchoyan', '2026-04-20', '2026-04-25', 'returned', '2026-04-25', 'Tether LL2-8'),
  ('LL1-8', 'Inga Khchoyan', '2026-04-27', '2026-04-30', 'returned', '2026-04-30', 'Tether LL1-8'),
  ('LL2-6', 'Inga Khchoyan', '2026-04-27', '2026-04-30', 'returned', '2026-04-30', 'Tether LL2-6'),
  ('RAD 42', 'Emil Wallnofer', '2026-04-27', '2026-04-30', 'returned', '2026-04-30', 'RAD 42'),
  ('REV 7 181', 'Emil Wallnofer', '2026-04-27', '2026-04-30', 'returned', '2026-04-30', 'REV 7 181')
) as v(asset_name, holder, start_date, end_date, status, returned_on, label)
join public.fleet_assets a
  on a.name = v.asset_name
 and a.active
where not exists (
  select 1 from public.fleet_reservations r
  where r.asset_id = a.id
    and r.holder_label = v.holder
    and r.start_date = v.start_date::date
    and r.end_date = v.end_date::date
);

-- ---------------------------------------------------------------------------
-- Not imported: labels whose equipment is not in the EMEA fleet list
-- ---------------------------------------------------------------------------
--
--   Matteo Saglia   2026-01-12..2026-01-23  Philipp Drone 2 for Adrien World Economic Forum
--   Philipp Jaegle  2026-01-19..2026-01-24  LEL-269        (LEL list has 218/233/234)
--   Camilla Grosso  2026-02-20..2026-02-28  DRONE CAMILLA  (nickname, not a unit id)
--   Emil Wallnofer  2026-02-22..2026-02-28  DRONE EMIL     (nickname, not a unit id)
--   Lucas Senault   2026-02-21..2026-03-07  Dummy Drone in bag  (x4 — E3R-XXX or SVA-X?)
--   Emil Wallnofer  2026-03-23..2026-03-28  UT Emil        (nickname; UT-07 is Emil's)
--   Tiago Leconte   2026-03-23..2026-03-28  UT Philipp     (nickname; UT-09 is Philipp's)
--   Emil Wallnofer  2026-04-22..2026-04-23  Tether LL1-3 + Power bank  (LL1-3 not in list)
--   Igor Stapper    2026-04-27..2026-04-30  RAD 87 - Framatome DE      (RAD list has 27/45/42)
--
-- The nicknames are resolvable if you confirm the mapping (DRONE EMIL -> E3R-414,
-- UT Emil -> UT-07, UT Philipp -> UT-09, DRONE CAMILLA -> SV9-68); the rest name
-- equipment that would first have to be added to the fleet.
