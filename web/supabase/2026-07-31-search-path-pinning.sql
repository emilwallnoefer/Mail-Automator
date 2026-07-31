-- Security audit run-3, hardening note H5 / SECURITY.md T1.12.
--
-- Every function in this schema pins `search_path`, which is correct — but most
-- pin it as `public, pg_catalog` or bare `public`, which resolves the `public`
-- schema BEFORE the system catalog. In a SECURITY DEFINER function that ordering
-- matters: an object created in `public` can shadow a built-in (say a custom
-- `to_char(date, text)`) and would then execute with the definer's rights.
--
-- Run-3 fixed the two functions it rewrote. This file repins the rest.
--
-- SEVERITY IN CONTEXT: this is defense-in-depth, not a live hole. Exploiting it
-- requires a role that can CREATE objects in schema `public`, and the run-3
-- verification confirmed neither `anon` nor `authenticated` holds that:
--
--   select has_schema_privilege('anon','public','CREATE'),
--          has_schema_privilege('authenticated','public','CREATE');
--   -- both false, verified 2026-07-26
--
-- We pin it anyway so the property holds even if someone later runs a broad
-- `grant ... on schema public`.
--
-- WHY `alter function` RATHER THAN `create or replace`: this changes only the
-- setting and leaves every function body byte-for-byte untouched. Re-declaring
-- nine bodies by hand to change one line is how you introduce a logic bug during
-- a security fix.
--
-- `pg_temp` is listed LAST deliberately: it is implicitly searched first for
-- relations unless named explicitly, which is its own (smaller) shadowing risk.
--
-- Safe to re-run — re-applying the same setting is a no-op.

do $$
declare
  fn record;
  n_changed integer := 0;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    where ns.nspname = 'public'
      and p.proname in (
        -- time tracker
        'tt_audit_row_change',
        'tt_refresh_overtime_bank_stats_trigger',
        'tt_bank_statement_trigger',
        'create_time_tracker_snapshot',
        'tt_user_week_v1',
        'tt_admin_overview',
        'tt_workspace_summary',
        -- mail tracking
        'mail_recipient_search',
        'mail_recipient_recent',
        'mail_recipient_week',
        'mail_overview_stats',
        'mail_click_timeline',
        'mail_link_leaderboard',
        -- chat
        'chat_messages_stamp_identity'
      )
  loop
    execute format(
      'alter function %s set search_path = pg_catalog, public, pg_temp',
      fn.sig
    );
    n_changed := n_changed + 1;
    raise notice 'repinned search_path: %', fn.sig;
  end loop;

  raise notice 'search_path repinned on % function(s)', n_changed;
end;
$$;

-- Verify: every row should read `search_path=pg_catalog, public, pg_temp`.
-- Any row that does not is a function added after this migration — repin it.
--
--   select p.proname,
--          p.prosecdef as security_definer,
--          array_to_string(p.proconfig, ', ') as settings
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proconfig is not null
--   order by p.proname;
