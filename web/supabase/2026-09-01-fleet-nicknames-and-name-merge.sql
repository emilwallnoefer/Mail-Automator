-- Fleet: merge duplicate holder names.
--
-- Run after `2026-09-01-fleet-roadshow-bookings.sql`.
--
-- The EMEA availability table writes first names ("Emil"); the roadshow
-- calendar writes full names ("Emil Wallnofer"). They are the same people.
--
-- Left alone, each person would be shown two separate names to claim, and
-- claiming one would not claim the other: the alias key is the NORMALISED
-- label, so "emil" and "emil wallnofer" are different keys. The short form is
-- folded into the long one, across both reservations and assets.
--
-- Nickname resolution (DRONE EMIL -> E3R-414 and friends) used to live here
-- too; it now happens inside `2026-09-01-fleet-roadshow-bookings.sql`, where
-- the bookings themselves are generated.
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Merge short holder names into full names
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
