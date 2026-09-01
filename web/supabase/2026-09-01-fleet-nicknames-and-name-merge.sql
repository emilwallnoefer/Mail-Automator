-- Fleet: resolve the roadshow nicknames, and merge duplicate holder names.
--
-- Run after `2026-09-01-fleet-roadshow-bookings.sql`.
--
-- Two clean-ups on the imported data, both confirmed rather than guessed:
--
-- 1. NICKNAMES. The roadshow calendar refers to people's assigned kit by the
--    owner's name ("DRONE EMIL", "UT Philipp") instead of the unit id. Each
--    resolves to that person's assigned unit in the EMEA availability list:
--
--      DRONE EMIL         -> E3R-414   (Emil's assigned drone)
--      DRONE CAMILLA      -> SV9-68    (Camilla's assigned drone)
--      UT Emil / UT EMIL  -> UT-07     (Emil's assigned UT payload)
--      UT Philipp         -> UT-09     (Philipp's assigned UT payload)
--      Dummy Drone in bag -> SVA-X     (the bookable dummy; E3R-XXX is out
--                                       with Total Energies, so it cannot be
--                                       the one being carried around)
--
--    Still NOT resolved, because the equipment is not in the EMEA fleet at all:
--      RAD 87 (Igor, Framatome DE) · LEL-269 (Philipp) · Tether LL1-3 (Emil)
--      "Philipp Drone 2 for Adrien World Economic Forum" (Matteo)
--    Add those units first if you want their bookings.
--
-- 2. DUPLICATE NAMES. The availability table writes first names ("Emil"), the
--    roadshow calendar writes full names ("Emil Wallnofer"). They are the same
--    people, and leaving both would show everyone two separate names to claim —
--    and claiming one would not claim the other, because the alias key is the
--    normalised label. The short form is folded into the full one.
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Nickname bookings
-- ---------------------------------------------------------------------------

insert into public.fleet_reservations
  (asset_id, user_id, holder_label, start_date, end_date, status, returned_on, purpose, source)
select a.id, null, v.holder, v.start_date::date, v.end_date::date,
       'returned', v.end_date::date, v.label, 'sheet_import'
from (values
  ('SV9-68',  'Camilla Grosso',     '2026-02-20', '2026-02-28', 'DRONE CAMILLA'),
  ('SVA-X',   'Lucas Senault',      '2026-02-21', '2026-02-22', 'Dummy Drone in bag'),
  ('E3R-414', 'Emil Wallnofer',     '2026-02-22', '2026-02-28', 'DRONE EMIL'),
  ('SVA-X',   'Lucas Senault',      '2026-02-23', '2026-02-28', 'Dummy Drone in bag'),
  ('SVA-X',   'Lucas Senault',      '2026-02-28', '2026-03-01', 'Dummy Drone in bag'),
  ('SVA-X',   'Lucas Senault',      '2026-03-02', '2026-03-07', 'Dummy Drone in bag'),
  ('UT-07',   'Emil Wallnofer',     '2026-03-23', '2026-03-28', 'UT Emil'),
  ('UT-09',   'Tiago Leconte Pais', '2026-03-23', '2026-03-28', 'UT Philipp')
) as v(asset_name, holder, start_date, end_date, label)
join public.fleet_assets a on a.name = v.asset_name and a.active
where not exists (
  select 1 from public.fleet_reservations r
  where r.asset_id = a.id
    and r.holder_label = v.holder
    and r.start_date = v.start_date::date
    and r.end_date = v.end_date::date
);

-- ---------------------------------------------------------------------------
-- 2. Merge short holder names into full names
-- ---------------------------------------------------------------------------

update public.fleet_reservations r
set holder_label = m.full_name
from (values
  ('Emil',    'Emil Wallnofer'),
  ('Camilla', 'Camilla Grosso'),
  ('Charles', 'Charles Rey'),
  ('Tiago',   'Tiago Leconte Pais'),
  ('Philipp', 'Philipp Jaegle'),
  ('Igor',    'Igor Stapper'),
  ('Lucas',   'Lucas Senault'),
  ('Fabio',   'Fabio Fata')
) as m(short_name, full_name)
where r.holder_label = m.short_name;

update public.fleet_assets a
set current_holder_label = m.full_name
from (values
  ('Emil',    'Emil Wallnofer'),
  ('Camilla', 'Camilla Grosso'),
  ('Charles', 'Charles Rey'),
  ('Tiago',   'Tiago Leconte Pais'),
  ('Philipp', 'Philipp Jaegle'),
  ('Igor',    'Igor Stapper'),
  ('Lucas',   'Lucas Senault'),
  ('Fabio',   'Fabio Fata')
) as m(short_name, full_name)
where a.current_holder_label = m.short_name;

-- Any alias already claimed under a short name should follow, so a person who
-- claimed "Emil" still owns the bookings now filed under "Emil Wallnofer".
insert into public.fleet_holder_aliases (label, user_id, claimed_by)
select lower(m.full_name), al.user_id, al.claimed_by
from public.fleet_holder_aliases al
join (values
  ('emil',    'Emil Wallnofer'),
  ('camilla', 'Camilla Grosso'),
  ('charles', 'Charles Rey'),
  ('tiago',   'Tiago Leconte Pais'),
  ('philipp', 'Philipp Jaegle'),
  ('igor',    'Igor Stapper'),
  ('lucas',   'Lucas Senault'),
  ('fabio',   'Fabio Fata')
) as m(short_label, full_name) on al.label = m.short_label
on conflict (label) do nothing;
