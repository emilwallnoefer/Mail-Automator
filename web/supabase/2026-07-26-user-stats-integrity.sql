-- Security audit run-3, finding F4. Apply by hand, together with
-- 2026-07-26-rpc-privilege-hardening.sql and BEFORE deploying the code.
--
-- `time_tracker_user_stats.overtime_bank_mins` is a DERIVED cache, recomputed by
-- tt_refresh_overtime_bank_stats() from time_day_logs + time_comp_adjustments.
-- 2026-04-16-overtime-bank-stats.sql granted `authenticated` select+insert+update
-- on it with own-row policies but no column restriction and no value check, so a
-- user could simply overwrite their own cached balance:
--
--   update time_tracker_user_stats set overtime_bank_mins = 99999
--     where user_id = auth.uid();
--
-- tt_admin_overview reads that column verbatim into the Admin -> Team time
-- dashboard, so the forged figure is what an admin/HR sees. The recompute
-- triggers only fire on time_day_logs / time_comp_adjustments DML, so a forged
-- value survives until the user next edits a day.
--
-- Fix: clients keep own-row SELECT and lose INSERT/UPDATE. The only writer is
-- tt_refresh_overtime_bank_stats (SECURITY DEFINER, self-scoped as of the
-- companion migration) and the service role. The client-side upsert fallback in
-- src/lib/time-tracker-queries.ts has been removed to match — it now computes
-- the value for display without persisting it.
--
-- Verify after applying, from an ordinary user session (anon key):
--   update time_tracker_user_stats set overtime_bank_mins = 99999
--     where user_id = auth.uid();          -- must fail: permission denied
--   select overtime_bank_mins from time_tracker_user_stats;  -- must still work
--
-- Safe to re-run.

revoke insert, update on table public.time_tracker_user_stats from authenticated;

-- SELECT stays: the Time Tracker reads the cache on every week fetch. The
-- own-row select policy from 2026-04-16-overtime-bank-stats.sql:22-25 is
-- unchanged and still scopes it to auth.uid().
grant select on table public.time_tracker_user_stats to authenticated;

-- The own-row insert/update policies from 2026-04-16-overtime-bank-stats.sql are
-- deliberately LEFT IN PLACE, not dropped. A policy never grants privilege — it
-- only filters one a GRANT already conferred — so with the grant gone they are
-- already unreachable for `authenticated`, and removing them buys nothing.
-- Keeping them is the conservative choice: this table has `force row level
-- security`, and the only remaining writer (tt_refresh_overtime_bank_stats,
-- SECURITY DEFINER) runs as the table owner. That works today because the owner
-- role holds BYPASSRLS, which overrides FORCE — but if that ever changes, these
-- policies are what keeps the writer working. Do not "clean them up".
