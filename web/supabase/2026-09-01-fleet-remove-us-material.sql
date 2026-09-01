-- Fleet: take the US office's material out of the tracker.
--
-- Run after `2026-09-01-fleet-assigned-pool.sql`.
--
-- The US fleet is managed separately, so its units should not appear in this
-- app's calendar, Assigned tab, material list or reminders.
--
-- SOFT removal: `active = false`, never DELETE. Every read path already filters
-- on `active`, so the units disappear from the app, while their rows, their
-- movement history in `fleet_asset_events` and any reservations against them
-- survive. Deleting would cascade the history away, and "we moved this to the
-- US team" is not the same as "this never existed".
--
-- To undo, flip it back:
--
--   update public.fleet_assets set active = true
--   where home_location = 'US Office' or current_location = 'US Office';
--
-- Safe to re-run.
--
-- Scope note: matched on the LOCATION columns, not a text search for "US".
-- `home_location = 'Customer'` contains the letters "us", so an ILIKE '%us%'
-- would have swept up the two end-customer units at Techitop and Terra
-- Inspectioneering, which have nothing to do with the US office.

update public.fleet_assets
set active = false
where active
  and (
    -- Physically at the US office today.
    current_location = 'US Office'
    -- Or owned by it and merely elsewhere right now — E3-SV9-67 is a US unit
    -- sitting at FMI for repair, and belongs with the rest of the US fleet.
    or home_location = 'US Office'
  );

-- Any live booking against a unit that has just left the tracker would sit in
-- someone's "My material" list forever with no way to check it in.
update public.fleet_reservations r
set status = 'cancelled'
from public.fleet_assets a
where r.asset_id = a.id
  and not a.active
  and r.status in ('reserved', 'picked_up');
