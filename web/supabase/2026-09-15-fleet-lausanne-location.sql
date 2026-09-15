-- Fleet: "EMEA" is not a location, "Pilots HQ Lausanne" is.
--
-- Run after `2026-09-02-fleet-emea-fleet-and-directory.sql`.
--
-- The starting inventory came from the EMEA availability sheet, where the
-- location column doubled as a region label: every pooled unit that was simply
-- at the office read "EMEA". That tells nobody where to go and pick the thing
-- up. The pooled fleet lives at the Lausanne pilots' HQ, so it is named.
--
-- Only the two location columns change, plus the location fields on the event
-- history so the trail still reads straight. `fleet_assets.owner_group` keeps
-- its 'EMEA' value — there it IS the region, which is what that column is for.
--
-- Safe to re-run: it matches on the old value and writes the new one.

update public.fleet_assets
   set current_location = 'Pilots HQ Lausanne'
 where current_location = 'EMEA';

update public.fleet_assets
   set home_location = 'Pilots HQ Lausanne'
 where home_location = 'EMEA';

update public.fleet_asset_events
   set from_location = 'Pilots HQ Lausanne'
 where from_location = 'EMEA';

update public.fleet_asset_events
   set to_location = 'Pilots HQ Lausanne'
 where to_location = 'EMEA';
