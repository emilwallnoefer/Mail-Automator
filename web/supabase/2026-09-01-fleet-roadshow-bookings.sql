-- Fleet: the 2026 bookings from the roadshow planning calendar.
--
-- Run after `2026-09-01-fleet-emea-inventory.sql`.
--
-- Source: "Elios 3 - Fleet Management - Roadshow planing 2025" — a two-year
-- (2025-2026) planning grid. Only 2026 is imported; 2025 is history the team
-- does not need, and the 2024 grid in the other spreadsheet is dead.
--
-- 178 bookings, 2026-01-05 to 2026-10-24, 16 units, 11 people.
-- 152 already finished, 26 still upcoming.
--
-- HOW THIS WAS READ, and the traps in it
-- --------------------------------------
-- The Drive connector truncates that workbook before reaching the roadshow tab,
-- so the calendar was reconstructed from the PDF export:
--
--   * Text: the page uses Identity-H CID fonts, so string bytes are 2-byte CIDs
--     that must go through each font's ToUnicode CMap.
--   * Spans: Sheets draws cell backgrounds as m/l/h polygons, not `re`. A
--     booking's merged-cell edges are the only thing encoding how many days it
--     covers; the label's position alone gives a start and nothing more.
--   * Person: the name sits in the FIRST row of each block, not centred in a
--     merged cell.
--
-- Three bugs this went through, all of which silently lost data rather than
-- failing loudly — worth knowing if this is ever re-run:
--
--   1. The day-number header is split across TWO text baselines. Reading one
--      baseline captured 485 of 730 columns, so the date grid ended on
--      2026-04-30 and every later booking fell outside it. This is why the
--      first import appeared to stop in April.
--   2. Only coloured fills were treated as cells, so bookings drawn on a white
--      background were dropped.
--   3. Column spacing is NOT uniform — a narrow "NEW YEAR" separator column
--      carries no day number — so interpolating an average pitch drifted the
--      dates by weeks. Always look up the real column positions.
--
-- Verified before generating: all 730 day columns match the day number printed
-- above them; the sheet's own vertical "NEW YEAR" marker lands on 31 Dec / 1
-- Jan; and labels naming their own owner ("DRONE EMIL", "UT Emil", "DRONE
-- CAMILLA") land on that owner.
--
-- Nicknames are resolved to the owner's assigned unit: DRONE EMIL -> E3R-414,
-- DRONE CAMILLA -> SV9-68, UT Emil -> UT-07, UT Philipp -> UT-09, and
-- "Dummy Drone in bag" -> SVA-X (E3R-XXX is out with Total Energies, so it
-- cannot be the one being carried to demos).
--
-- Every row is filed under `holder_label` with no `user_id`, so it can never
-- trigger a reminder, and `source = 'sheet_import'`, so it never affects
-- anyone's reliability score.
--
-- Safe to re-run: skips any (asset, holder, start, end) already present.

insert into public.fleet_reservations
  (asset_id, user_id, holder_label, start_date, end_date, status, returned_on, purpose, source)
select a.id, null, v.holder, v.start_date::date, v.end_date::date,
       v.status, v.returned_on::date, v.label, 'sheet_import'
from (values
  ('UT-06', 'Inga Khchoyan', '2026-01-05', '2026-01-10', 'returned', '2026-01-10', 'UT-06 (Roav7)'),
  ('UT-06', 'Inga Khchoyan', '2026-01-12', '2026-01-17', 'returned', '2026-01-17', 'UT-06 (Roav7)'),
  ('SVA-346', 'Philipp Jaegle', '2026-01-19', '2026-01-24', 'returned', '2026-01-24', 'SVA-346'),
  ('LL2-8', 'Emil Wallnofer', '2026-01-21', '2026-01-23', 'returned', '2026-01-23', 'LL2-8 C5 Testing'),
  ('REV 7 181', 'Inga Khchoyan', '2026-01-26', '2026-01-31', 'returned', '2026-01-31', 'REV 7 181'),
  ('REV 7 181', 'Lucas Senault', '2026-02-02', '2026-02-06', 'returned', '2026-02-06', 'REV 7 181'),
  ('REV 7 519', 'Inga Khchoyan', '2026-02-02', '2026-02-06', 'returned', '2026-02-06', 'REV 7 519'),
  ('UT-06', 'Inga Khchoyan', '2026-02-02', '2026-02-06', 'returned', '2026-02-06', 'UT-06'),
  ('LL2-8', 'Philipp Jaegle', '2026-02-07', '2026-02-22', 'returned', '2026-02-22', 'Tether LL2-8'),
  ('REV 7 181', 'Lucas Senault', '2026-02-09', '2026-02-14', 'returned', '2026-02-14', 'REV 7 181'),
  ('REV 7 519', 'Inga Khchoyan', '2026-02-09', '2026-02-14', 'returned', '2026-02-14', 'REV 7 519'),
  ('UT-06', 'Inga Khchoyan', '2026-02-09', '2026-02-14', 'returned', '2026-02-14', 'UT-06'),
  ('LL2-6', 'Lucas Senault', '2026-02-16', '2026-02-21', 'returned', '2026-02-21', 'Tether LL2-6'),
  ('RAD 42', 'Inga Khchoyan', '2026-02-16', '2026-02-21', 'returned', '2026-02-21', 'RAD 42 - Engie BE'),
  ('REV 7 181', 'Inga Khchoyan', '2026-02-16', '2026-02-21', 'returned', '2026-02-21', 'REV 7 181 - Drone Eksperten'),
  ('UT-06', 'Lucas Senault', '2026-02-16', '2026-02-21', 'returned', '2026-02-21', 'UT-06'),
  ('SVA-346', 'Matteo Saglia', '2026-02-19', '2026-02-28', 'returned', '2026-02-28', 'SVA-346'),
  ('SV9-68', 'Camilla Grosso', '2026-02-20', '2026-02-28', 'returned', '2026-02-28', 'DRONE CAMILLA'),
  ('SVA-X', 'Lucas Senault', '2026-02-21', '2026-02-22', 'returned', '2026-02-22', 'Dummy Drone in bag'),
  ('E3R-414', 'Emil Wallnofer', '2026-02-22', '2026-02-28', 'returned', '2026-02-28', 'DRONE EMIL'),
  ('LL2-8', 'Tiago Leconte Pais', '2026-02-22', '2026-02-28', 'returned', '2026-02-28', 'Tether LL2-8'),
  ('LL2-6', 'Inga Khchoyan', '2026-02-23', '2026-02-28', 'returned', '2026-02-28', 'Tether LL2-6'),
  ('LL2-8', 'Inga Khchoyan', '2026-02-23', '2026-02-28', 'returned', '2026-02-28', 'Tether LL2-8'),
  ('RAD 42', 'Philipp Jaegle', '2026-02-23', '2026-03-01', 'returned', '2026-03-01', 'RAD 42 - Engie BE'),
  ('UT-06', 'Philipp Jaegle', '2026-02-23', '2026-03-01', 'returned', '2026-03-01', 'UT-06'),
  ('SVA-X', 'Lucas Senault', '2026-02-28', '2026-03-01', 'returned', '2026-03-01', 'Dummy Drone in bag'),
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
  ('UT-07', 'Inga Khchoyan', '2026-03-23', '2026-03-28', 'returned', '2026-03-28', 'UT Emil'),
  ('UT-09', 'Tiago Leconte Pais', '2026-03-23', '2026-03-28', 'returned', '2026-03-28', 'UT Philipp'),
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
  ('LL1-8', 'Inga Khchoyan', '2026-04-27', '2026-05-01', 'returned', '2026-05-01', 'Tether LL1-8'),
  ('LL2-6', 'Inga Khchoyan', '2026-04-27', '2026-05-01', 'returned', '2026-05-01', 'Tether LL2-6'),
  ('RAD 42', 'Emil Wallnofer', '2026-04-27', '2026-05-01', 'returned', '2026-05-01', 'RAD 42'),
  ('REV 7 181', 'Emil Wallnofer', '2026-04-27', '2026-05-01', 'returned', '2026-05-01', 'REV 7 181'),
  ('LL1-8', 'Inga Khchoyan', '2026-05-04', '2026-05-08', 'returned', '2026-05-08', 'Tether LL1-8'),
  ('LL2-6', 'Inga Khchoyan', '2026-05-04', '2026-05-08', 'returned', '2026-05-08', 'Tether LL2-6'),
  ('LL2-8', 'Charles Rey', '2026-05-04', '2026-05-08', 'returned', '2026-05-08', 'Tether LL2-8'),
  ('REV 7 181', 'Emil Wallnofer', '2026-05-04', '2026-05-08', 'returned', '2026-05-08', 'REV 7 181'),
  ('LL1-8', 'Inga Khchoyan', '2026-05-11', '2026-05-15', 'returned', '2026-05-15', 'Tether LL1-8'),
  ('LL2-6', 'Inga Khchoyan', '2026-05-11', '2026-05-15', 'returned', '2026-05-15', 'Tether LL2-6'),
  ('LL2-8', 'Inga Khchoyan', '2026-05-11', '2026-05-15', 'returned', '2026-05-15', 'Tether LL2-8'),
  ('LL1-8', 'Lucas Senault', '2026-05-18', '2026-05-23', 'returned', '2026-05-23', 'Tether LL1-8'),
  ('LL2-6', 'Inga Khchoyan', '2026-05-18', '2026-05-23', 'returned', '2026-05-23', 'Tether LL2-6'),
  ('LL2-8', 'Inga Khchoyan', '2026-05-18', '2026-05-23', 'returned', '2026-05-23', 'Tether LL2-8'),
  ('RAD 42', 'Lucas Senault', '2026-05-18', '2026-05-23', 'returned', '2026-05-23', 'RAD 42'),
  ('REV 7 519', 'Lucas Senault', '2026-05-18', '2026-05-23', 'returned', '2026-05-23', 'REV 7 519'),
  ('UT-06', 'Inga Khchoyan', '2026-05-18', '2026-05-23', 'returned', '2026-05-23', 'UT-06 (without box)'),
  ('LL1-8', 'Inga Khchoyan', '2026-05-25', '2026-05-29', 'returned', '2026-05-29', 'Tether LL1-8'),
  ('LL1-8', 'Lucas Senault', '2026-05-25', '2026-05-29', 'returned', '2026-05-29', 'Tether LL1-8'),
  ('LL2-6', 'Inga Khchoyan', '2026-05-25', '2026-05-29', 'returned', '2026-05-29', 'Tether LL2-6'),
  ('RAD 42', 'Lucas Senault', '2026-05-25', '2026-05-29', 'returned', '2026-05-29', 'RAD 42'),
  ('REV 7 519', 'Lucas Senault', '2026-05-25', '2026-05-29', 'returned', '2026-05-29', 'REV 7 519'),
  ('UT-06', 'Inga Khchoyan', '2026-05-25', '2026-05-29', 'returned', '2026-05-29', 'UT-06 (without box)'),
  ('UT-09', 'Philipp Jaegle', '2026-05-25', '2026-05-29', 'returned', '2026-05-29', 'UT-09 (Philipp)'),
  ('SVA-X', 'Lucas Senault', '2026-05-30', '2026-05-31', 'returned', '2026-05-31', 'Dummy Drone in bag'),
  ('E3R-409', 'Philipp Jaegle', '2026-06-01', '2026-06-05', 'returned', '2026-06-05', 'E3R-409 + 2 REX'),
  ('LL1-8', 'Charles Rey', '2026-06-01', '2026-06-05', 'returned', '2026-06-05', 'Tether LL1-8'),
  ('LL1-8', 'Inga Khchoyan', '2026-06-01', '2026-06-05', 'returned', '2026-06-05', 'Tether LL1-8'),
  ('LL2-8', 'Inga Khchoyan', '2026-06-01', '2026-06-05', 'returned', '2026-06-05', 'Tether LL2-8'),
  ('RAD 42', 'Lucas Senault', '2026-06-01', '2026-06-05', 'returned', '2026-06-05', 'RAD 42'),
  ('REV 7 519', 'Lucas Senault', '2026-06-01', '2026-06-05', 'returned', '2026-06-05', 'REV 7 519'),
  ('UT-06', 'Inga Khchoyan', '2026-06-01', '2026-06-05', 'returned', '2026-06-05', 'UT-06 (without box)'),
  ('UT-09', 'Camilla Grosso', '2026-06-01', '2026-06-05', 'returned', '2026-06-05', 'UT-09 (Philipp)'),
  ('SVA-X', 'Lucas Senault', '2026-06-06', '2026-06-07', 'returned', '2026-06-07', 'Dummy Drone in bag'),
  ('E3R-409', 'Philipp Jaegle', '2026-06-08', '2026-06-13', 'returned', '2026-06-13', 'E3R-409 + 2 REX'),
  ('LL1-8', 'Inga Khchoyan', '2026-06-08', '2026-06-13', 'returned', '2026-06-13', 'Tether LL1-8'),
  ('LL1-8', 'Tiago Leconte Pais', '2026-06-08', '2026-06-08', 'returned', '2026-06-08', 'Tether LL1-8'),
  ('RAD 42', 'Lucas Senault', '2026-06-08', '2026-06-13', 'returned', '2026-06-13', 'RAD 42'),
  ('REV 7 519', 'Lucas Senault', '2026-06-08', '2026-06-13', 'returned', '2026-06-13', 'REV 7 519'),
  ('SVA-346', 'François Theil', '2026-06-08', '2026-06-08', 'returned', '2026-06-08', 'SVA-346'),
  ('UT-06', 'Inga Khchoyan', '2026-06-08', '2026-06-13', 'returned', '2026-06-13', 'UT-06 (without box)'),
  ('UT-09', 'Tiago Leconte Pais', '2026-06-09', '2026-06-09', 'returned', '2026-06-09', 'UT-09'),
  ('SVA-X', 'Inga Khchoyan', '2026-06-13', '2026-06-14', 'returned', '2026-06-14', 'Dummy Drone in bag'),
  ('LL1-8', 'Inga Khchoyan', '2026-06-15', '2026-06-19', 'returned', '2026-06-19', 'Tether LL1-8'),
  ('LL2-8', 'Inga Khchoyan', '2026-06-15', '2026-06-19', 'returned', '2026-06-19', 'Tether LL2-8'),
  ('RAD 42', 'Lucas Senault', '2026-06-15', '2026-06-19', 'returned', '2026-06-19', 'RAD 42'),
  ('SVA-X', 'Inga Khchoyan', '2026-06-20', '2026-06-22', 'returned', '2026-06-22', 'Dummy Drone in bag'),
  ('LL1-8', 'Inga Khchoyan', '2026-06-22', '2026-06-27', 'returned', '2026-06-27', 'Tether LL1-8'),
  ('LL2-8', 'Inga Khchoyan', '2026-06-22', '2026-06-27', 'returned', '2026-06-27', 'Tether LL2-8'),
  ('LL2-8', 'Lucas Senault', '2026-06-22', '2026-06-27', 'returned', '2026-06-27', 'Tether LL2-8'),
  ('REV 7 519', 'Lucas Senault', '2026-06-22', '2026-06-27', 'returned', '2026-06-27', 'REV 7 519'),
  ('UT-06', 'Lucas Senault', '2026-06-22', '2026-06-27', 'returned', '2026-06-27', 'UT-06 (without box)'),
  ('SVA-257', 'François Theil', '2026-06-26', '2026-07-28', 'returned', '2026-07-28', 'SVA-257'),
  ('E3R-409', 'Philipp Jaegle', '2026-06-29', '2026-07-08', 'returned', '2026-07-08', 'E3R-409'),
  ('LL1-8', 'Inga Khchoyan', '2026-06-29', '2026-07-03', 'returned', '2026-07-03', 'Tether LL1-8'),
  ('LL2-8', 'Inga Khchoyan', '2026-06-29', '2026-07-03', 'returned', '2026-07-03', 'Tether LL2-8'),
  ('LL2-8', 'Lucas Senault', '2026-06-29', '2026-07-03', 'returned', '2026-07-03', 'Tether LL2-8'),
  ('RAD 42', 'Lucas Senault', '2026-06-29', '2026-07-03', 'returned', '2026-07-03', 'RAD 42'),
  ('REV 7 519', 'Lucas Senault', '2026-06-29', '2026-07-03', 'returned', '2026-07-03', 'REV 7 519'),
  ('UT-06', 'Inga Khchoyan', '2026-06-29', '2026-07-03', 'returned', '2026-07-03', 'UT-06 (without box)'),
  ('LL1-8', 'Tiago Leconte Pais', '2026-07-02', '2026-07-12', 'returned', '2026-07-12', 'Tether LL1-8 Blocker (in Repair)'),
  ('LL2-8', 'Inga Khchoyan', '2026-07-06', '2026-07-11', 'returned', '2026-07-11', 'Tether LL2-8'),
  ('LL2-8', 'Lucas Senault', '2026-07-06', '2026-07-11', 'returned', '2026-07-11', 'Tether LL2-8'),
  ('RAD 42', 'Lucas Senault', '2026-07-06', '2026-07-11', 'returned', '2026-07-11', 'RAD 42'),
  ('REV 7 519', 'Inga Khchoyan', '2026-07-06', '2026-07-11', 'returned', '2026-07-11', 'REV 7 519'),
  ('UT-06', 'Inga Khchoyan', '2026-07-06', '2026-07-11', 'returned', '2026-07-11', 'UT-06 (without box)'),
  ('LL2-8', 'Inga Khchoyan', '2026-07-13', '2026-07-18', 'returned', '2026-07-18', 'Tether LL2-8'),
  ('LL2-6', 'Matteo Saglia', '2026-07-20', '2026-07-24', 'returned', '2026-07-24', 'Tether LL2-6'),
  ('LL2-8', 'Inga Khchoyan', '2026-07-20', '2026-07-24', 'returned', '2026-07-24', 'Tether LL2-8'),
  ('LL1-8', 'Inga Khchoyan', '2026-07-27', '2026-07-31', 'returned', '2026-07-31', 'Tether LL1-8'),
  ('LL2-8', 'Inga Khchoyan', '2026-07-27', '2026-07-31', 'returned', '2026-07-31', 'Tether LL2-8'),
  ('REV 7 519', 'Lucas Senault', '2026-07-27', '2026-07-31', 'returned', '2026-07-31', 'REV 7 519'),
  ('REV 7 519', 'Tiago Leconte Pais', '2026-07-27', '2026-07-31', 'returned', '2026-07-31', 'REX 519'),
  ('UT-06', 'Inga Khchoyan', '2026-07-27', '2026-07-31', 'returned', '2026-07-31', 'UT-06'),
  ('LL1-8', 'François Theil', '2026-08-03', '2026-08-07', 'returned', '2026-08-07', 'Tether LL1-8'),
  ('LL2-6', 'Inga Khchoyan', '2026-08-03', '2026-08-07', 'returned', '2026-08-07', 'Tether LL2-6'),
  ('LL2-8', 'Inga Khchoyan', '2026-08-03', '2026-08-07', 'returned', '2026-08-07', 'Tether LL2-8'),
  ('LL2-6', 'Inga Khchoyan', '2026-08-10', '2026-08-15', 'returned', '2026-08-15', 'Tether LL2-6'),
  ('LL2-8', 'Inga Khchoyan', '2026-08-10', '2026-08-15', 'returned', '2026-08-15', 'Tether LL2-8'),
  ('LL1-8', 'Emil Wallnofer', '2026-08-17', '2026-08-22', 'returned', '2026-08-22', 'Tether LL1-8'),
  ('LL2-6', 'Lucas Senault', '2026-08-17', '2026-08-22', 'returned', '2026-08-22', 'Tether LL2-6'),
  ('LL2-8', 'Inga Khchoyan', '2026-08-17', '2026-08-22', 'returned', '2026-08-22', 'Tether LL2-8'),
  ('REV 7 519', 'Inga Khchoyan', '2026-08-17', '2026-08-22', 'returned', '2026-08-22', 'REV 7 519'),
  ('UT-06', 'Inga Khchoyan', '2026-08-17', '2026-08-22', 'returned', '2026-08-22', 'UT-06'),
  ('LL1-8', 'Lucas Senault', '2026-08-24', '2026-08-28', 'returned', '2026-08-28', 'Tether LL1-8'),
  ('LL2-6', 'Lucas Senault', '2026-08-24', '2026-08-28', 'returned', '2026-08-28', 'Tether LL2-6'),
  ('LL2-8', 'Inga Khchoyan', '2026-08-24', '2026-08-28', 'returned', '2026-08-28', 'Tether LL2-8'),
  ('REV 7 519', 'Inga Khchoyan', '2026-08-24', '2026-08-28', 'returned', '2026-08-28', 'REV 7 519'),
  ('UT-06', 'Inga Khchoyan', '2026-08-24', '2026-08-28', 'returned', '2026-08-28', 'UT-06'),
  ('RAD 42', 'Tiago Leconte Pais', '2026-08-26', '2026-08-27', 'returned', '2026-08-27', '20015 42'),
  ('SVA-257', 'François Theil', '2026-08-26', '2026-08-27', 'returned', '2026-08-27', 'SVA-257'),
  ('UT-09', 'Tiago Leconte Pais', '2026-08-26', '2026-08-27', 'returned', '2026-08-27', 'UT-09'),
  ('SVA-X', 'Lucas Senault', '2026-08-29', '2026-08-31', 'returned', '2026-08-31', 'Dummy Drone in bag'),
  ('LL1-8', 'Lucas Senault', '2026-08-31', '2026-09-04', 'reserved', null, 'Tether LL1-8'),
  ('LL2-8', 'Inga Khchoyan', '2026-08-31', '2026-09-04', 'reserved', null, 'Tether LL2-8'),
  ('REV 7 181', 'Philipp Jaegle', '2026-08-31', '2026-09-04', 'reserved', null, 'REV 7 181'),
  ('REV 7 519', 'Inga Khchoyan', '2026-08-31', '2026-09-04', 'reserved', null, 'REV 7 519'),
  ('REV 7 947', 'Charles Rey', '2026-08-31', '2026-09-04', 'reserved', null, '122602002 947'),
  ('SVA-257', 'Fabio Fata', '2026-08-31', '2026-09-04', 'reserved', null, 'SVA-257'),
  ('UT-06', 'Inga Khchoyan', '2026-08-31', '2026-09-04', 'reserved', null, 'UT-06'),
  ('UT-09', 'Matteo Saglia', '2026-08-31', '2026-09-04', 'reserved', null, 'UT-09'),
  ('SVA-X', 'Lucas Senault', '2026-09-05', '2026-09-06', 'reserved', null, 'Dummy Drone in bag'),
  ('LL2-6', 'Tiago Leconte Pais', '2026-09-07', '2026-09-07', 'reserved', null, 'Tether LL2-6'),
  ('LL2-8', 'Inga Khchoyan', '2026-09-07', '2026-09-11', 'reserved', null, 'Tether LL2-8'),
  ('REV 7 519', 'Inga Khchoyan', '2026-09-07', '2026-09-11', 'reserved', null, 'REV 7 519'),
  ('REV 7 947', 'Charles Rey', '2026-09-07', '2026-09-11', 'reserved', null, '122602002 947'),
  ('UT-06', 'Inga Khchoyan', '2026-09-07', '2026-09-11', 'reserved', null, 'UT-06'),
  ('LL2-6', 'Inga Khchoyan', '2026-09-11', '2026-09-19', 'reserved', null, 'Tether LL2-6'),
  ('SVA-X', 'Inga Khchoyan', '2026-09-12', '2026-09-14', 'reserved', null, 'Dummy Drone in bag'),
  ('LL1-8', 'Lucas Senault', '2026-09-14', '2026-09-19', 'reserved', null, 'Tether LL2-8 or LL1-8'),
  ('LL2-8', 'Inga Khchoyan', '2026-09-14', '2026-09-19', 'reserved', null, 'Tether LL2-8'),
  ('REV 7 947', 'Charles Rey', '2026-09-14', '2026-09-19', 'reserved', null, '122602002 947'),
  ('UT-06', 'Inga Khchoyan', '2026-09-14', '2026-09-19', 'reserved', null, 'UT-06'),
  ('SVA-X', 'Inga Khchoyan', '2026-09-19', '2026-09-21', 'reserved', null, 'Dummy Drone in bag'),
  ('LL2-6', 'Inga Khchoyan', '2026-09-21', '2026-10-14', 'reserved', null, 'Tether LL2-6'),
  ('LL2-8', 'Inga Khchoyan', '2026-09-21', '2026-09-26', 'reserved', null, 'Tether LL2-8'),
  ('UT-06', 'Inga Khchoyan', '2026-09-21', '2026-09-26', 'reserved', null, 'UT-06'),
  ('LL1-8', 'Lucas Senault', '2026-09-26', '2026-09-27', 'reserved', null, 'Tether LL2-8 or LL1-8 (TBC)'),
  ('LL2-8', 'Charles Rey', '2026-10-19', '2026-10-24', 'reserved', null, 'LL2-8')
) as v(asset_name, holder, start_date, end_date, status, returned_on, label)
join public.fleet_assets a on a.name = v.asset_name and a.active
where not exists (
  select 1 from public.fleet_reservations r
  where r.asset_id = a.id
    and r.holder_label = v.holder
    and r.start_date = v.start_date::date
    and r.end_date = v.end_date::date
);

-- ---------------------------------------------------------------------------
-- Deliberately NOT imported
-- ---------------------------------------------------------------------------
--
-- Equipment that is not in the EMEA fleet list, so there is nothing to attach
-- the booking to. Add the unit first if you want its history:
--
--   RAD 87 (Igor, Framatome DE)        REV 6 105460 (François)
--   LEL-269 (Philipp)                  REV6 122322001086 (Tiago)
--   Tether LL1-3 + Power bank (Emil)   Tether product LL2-11 (Lucas, x2)
--   "Philipp Drone 2 for Adrien World Economic Forum" (Matteo)
--   Two of Fabio's tether demos, which name a customer rather than a unit.
--
-- Four of Lucas's September tether bookings read "Tether LL2-8 or LL1-8 (TBC)"
-- — genuinely undecided in the sheet. Only the first of each overlapping pair
-- is imported; a booking cannot hold two units at once, and guessing which one
-- would put the wrong unit out of service.
--
-- One booking for Igor ("Dummy Drone (E3+UT) for DGZfP", Mar-Jul) exceeds the
-- 84-day cap in fleet_reservations_max_length. It is a long-running trade-show
-- loan and should be an ASSIGNMENT (pooled = false) rather than a booking.
