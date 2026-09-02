-- Fleet: the EMEA material list, and the name -> email directory behind it.
--
-- Run after `2026-09-01-fleet-assigned-pool.sql`.
--
-- Two things, and they belong together:
--
-- 1. THE DIRECTORY. The fleet list names holders by first name ("ASSIGNED
--    (CHARLES)"), but accounts are identified by email. Guessing the link from
--    the name alone works until two people share a first name, so the mapping
--    is recorded explicitly instead. When someone signs in — or signs up for
--    the first time — their email is looked up here and their material is
--    linked to them with no prompt and no guessing.
--
--    `kind = 'external'` marks a holder that is NOT a person and will never
--    have an account (a customer, a region). Those are never offered to anyone
--    as a name to claim, which is the difference between "nobody has claimed
--    this yet" and "nobody ever will".
--
-- 2. THE FLEET. 31 units in seven groups, as the EMEA availability table has
--    them. This is the starting inventory; from here it is maintained in the
--    app (Fleet -> Manage, admin only), not by editing this file.
--
-- Safe to re-run: the fleet insert skips units that already exist by name, so
-- re-running will not clobber edits made in the app.

-- ---------------------------------------------------------------------------
-- Directory: holder name -> account email
-- ---------------------------------------------------------------------------

create table if not exists public.fleet_holder_directory (
  -- Normalised holder label, matching `normalizeHolderLabel()` in
  -- web/src/lib/fleet-rules.ts: lower-cased, accent-folded, punctuation
  -- stripped, whitespace collapsed.
  label text primary key,
  -- How the name is written in the fleet list, for display.
  display_name text not null,
  -- The account this holder is. Null for external holders.
  email text,
  -- 'person'   — a colleague who has, or will have, an account.
  -- 'external' — a customer or region that never will.
  kind text not null default 'person',
  created_at timestamptz not null default now(),
  constraint fleet_holder_directory_kind_check check (kind in ('person', 'external')),
  -- A person needs an email to be matched by; an external holder must not have one.
  constraint fleet_holder_directory_email_shape
    check ((kind = 'person' and email is not null) or (kind = 'external' and email is null))
);

create unique index if not exists fleet_holder_directory_email_unique
  on public.fleet_holder_directory (lower(email))
  where email is not null;

alter table public.fleet_holder_directory enable row level security;
alter table public.fleet_holder_directory force row level security;
revoke all on table public.fleet_holder_directory from anon, authenticated;
-- Readable by everyone signed in: the UI shows who a name belongs to. Written
-- only by the service-role client behind /api/fleet.
grant select on table public.fleet_holder_directory to authenticated;

drop policy if exists "fleet_holder_directory_select_all" on public.fleet_holder_directory;
create policy "fleet_holder_directory_select_all"
  on public.fleet_holder_directory for select to authenticated using (true);

insert into public.fleet_holder_directory (label, display_name, email, kind)
values
  ('charles', 'Charles', 'charles.rey@flyability.com',        'person'),
  ('tiago',   'Tiago',   'tiago.lecontepais@flyability.com',  'person'),
  ('philipp', 'Philipp', 'philipp.jaegle@flyability.com',     'person'),
  ('emil',    'Emil',    'emil.wallnoefer@flyability.com',    'person'),
  ('lucas',   'Lucas',   'lucas.senault@flyability.com',      'person'),
  ('camilla', 'Camilla', 'camilla.grosso@flyability.com',     'person'),
  ('fabio',   'Fabio',   'fabio.fata@flyability.com',         'person'),
  ('igor',    'Igor',    'igor.stapper@flyability.com',       'person'),
  -- Holders that will never have an account.
  ('total energies', 'Total Energies', null, 'external'),
  ('usa',            'USA',            null, 'external')
on conflict (label) do update
  set display_name = excluded.display_name,
      email = excluded.email,
      kind = excluded.kind;

-- ---------------------------------------------------------------------------
-- The EMEA fleet
-- ---------------------------------------------------------------------------
--
-- "ASSIGNED (name)"  -> pooled = false, status 'out', holder recorded.
--                       Lives in the Assigned tab, never in the calendar.
-- "BOOK IN TABLE"    -> pooled = true, status 'available'.
--                       The shared pool the calendar renders.

insert into public.fleet_assets
  (name, serial_number, category, model, owner_group, status, pooled,
   home_location, current_location, current_holder_label, notes)
select v.name, v.serial, v.category, v.model, 'EMEA', v.status, v.pooled,
       'EMEA', v.location, v.holder, v.notes
from (values
  -- DRONE FLEET EMEA -------------------------------------------------------
  ('SVA-330', null::text,        'drone', 'Elios 3', 'out',       false, 'With Charles', 'Charles', null::text),
  ('SVA-346', null,              'drone', 'Elios 3', 'out',       false, 'With Tiago',   'Tiago',   null),
  ('E3R-409', null,              'drone', 'Elios 3', 'out',       false, 'With Philipp', 'Philipp', null),
  ('E3R-414', null,              'drone', 'Elios 3', 'out',       false, 'With Emil',    'Emil',    null),
  ('DV2-4',   null,              'drone', 'Elios 3', 'out',       false, 'With Lucas',   'Lucas',   null),
  ('SV9-68',  null,              'drone', 'Elios 3', 'out',       false, 'With Camilla', 'Camilla', null),
  ('SVA-257', null,              'drone', 'Elios 3', 'available', true,  'EMEA',         null,      null),

  -- LIDAR REV 7 EMEA -------------------------------------------------------
  -- Serial is the sheet's full number; the name uses the short id people say
  -- out loud ("Rev 7 181").
  ('REV 7 073', '1223240002073', 'lidar', 'LiDAR Rev 7', 'out',       false, 'With Fabio',   'Fabio',   null),
  ('REV 7 158', '122324000158',  'lidar', 'LiDAR Rev 7', 'out',       false, 'With Igor',    'Igor',    null),
  ('REV 7 947', '122602002947',  'lidar', 'LiDAR Rev 7', 'out',       false, 'With Emil',    'Emil',    null),
  ('REV 7 108', '122448001108',  'lidar', 'LiDAR Rev 7', 'out',       false, 'With Tiago',   'Tiago',   null),
  ('REV 7 181', '122328001181',  'lidar', 'LiDAR Rev 7', 'available', true,  'EMEA',         null,      null),
  ('REV 7 519', '122448001519',  'lidar', 'LiDAR Rev 7', 'available', true,  'EMEA',         null,      null),

  -- RAD PAYLOAD EMEA -------------------------------------------------------
  ('RAD 27', '2003627', 'rad_payload', 'RAD payload', 'out',       false, 'With Fabio', 'Fabio', null),
  -- The sheet marks 45 both "in repair" and "book in table". Kept in-repair, so
  -- it stays out of the calendar until it is serviceable; flip `status` to
  -- 'available' when it comes back.
  ('RAD 45', '2001545', 'rad_payload', 'RAD payload', 'in_repair', true,  'EMEA',       null,    'In repair (per fleet sheet)'),
  ('RAD 42', '2001542', 'rad_payload', 'RAD payload', 'available', true,  'EMEA',       null,    null),

  -- UT PAYLOAD EMEA --------------------------------------------------------
  ('UT-03', null, 'ut_payload', 'UT payload', 'out',       false, 'With Igor',    'Igor',    null),
  ('UT-09', null, 'ut_payload', 'UT payload', 'out',       false, 'With Philipp', 'Philipp', null),
  ('UT-07', null, 'ut_payload', 'UT payload', 'out',       false, 'With Emil',    'Emil',    null),
  ('UT-06', null, 'ut_payload', 'UT payload', 'available', true,  'EMEA',         null,      null),

  -- LEL PAYLOAD EMEA -------------------------------------------------------
  ('LEL-218', null, 'lel_payload', 'LEL payload', 'available', true, 'EMEA', null, null),
  ('LEL-233', null, 'lel_payload', 'LEL payload', 'available', true, 'EMEA', null, null),
  ('LEL-234', null, 'lel_payload', 'LEL payload', 'available', true, 'EMEA', null, null),

  -- DUMMY DRONES EMEA ------------------------------------------------------
  -- E3R-XXX is with Total Energies permanently. It is assigned to an EXTERNAL
  -- holder, so it never appears in the calendar and its name is never offered
  -- to anyone as something to claim.
  ('E3R-XXX', null, 'dummy_drone', 'Dummy drone', 'out',       false, 'Total Energies', 'Total Energies', 'Permanently with Total Energies'),
  ('SVA-X',   null, 'dummy_drone', 'Dummy drone', 'available', true,  'EMEA',           null,             null),

  -- TETHER -----------------------------------------------------------------
  ('LL1-8',  null, 'tether', 'Tether', 'available', true,  'EMEA',      null,   null),
  ('LL2-6',  null, 'tether', 'Tether', 'available', true,  'EMEA',      null,   null),
  ('LL2-8',  null, 'tether', 'Tether', 'available', true,  'EMEA',      null,   null),
  ('LL2-7',  null, 'tether', 'Tether', 'out',       false, 'With Igor', 'Igor', 'Permanently with Igor'),
  ('LL2-9',  null, 'tether', 'Tether', 'out',       false, 'USA',       'USA',  'Indefinitely in the USA'),
  ('LL2-10', null, 'tether', 'Tether', 'out',       false, 'USA',       'USA',  'Indefinitely in the USA')
) as v(name, serial, category, model, status, pooled, location, holder, notes)
where not exists (
  select 1 from public.fleet_assets a where a.name = v.name
);
