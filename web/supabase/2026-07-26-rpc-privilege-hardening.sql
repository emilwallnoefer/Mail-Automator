-- Security audit run-3, findings F1/F2/H5. Apply by hand like the other flat
-- migrations, BEFORE deploying the accompanying code.
--
-- Two SECURITY DEFINER functions were created without the
-- `revoke all on function ... from public` that every other RPC in this schema
-- pairs with its grant. Postgres grants EXECUTE to PUBLIC by default on CREATE
-- FUNCTION, and CREATE OR REPLACE *preserves* the existing ACL — so both have
-- been executable by `anon` and `authenticated` since they were first created.
--
--   tt_refresh_overtime_bank_stats(uuid, date)  — takes a target user id it
--     never compares to auth.uid(), reads time_day_logs + time_comp_adjustments
--     with RLS bypassed, RETURNS that user's overtime balance and upserts their
--     time_tracker_user_stats row. Cross-user read + write.
--   tt_resolve_audit_user_id(text, jsonb, jsonb) — returns the owning user_id of
--     any time_day_logs row given its (sequential, guessable) bigint id.
--
-- To confirm the live ACL before/after applying this file:
--
--   select p.proname, p.prosecdef, array_to_string(p.proacl, E'\n') as acl
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname in ('tt_refresh_overtime_bank_stats','tt_resolve_audit_user_id');
--
-- A `proacl` entry starting with `=X/` (empty grantee) means PUBLIC holds
-- EXECUTE; a NULL proacl means the built-in default (PUBLIC EXECUTE) applies.
-- After this migration, tt_refresh_overtime_bank_stats should show only
-- `authenticated=X/...` (plus the owner) and tt_resolve_audit_user_id no
-- grantees at all.
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. tt_refresh_overtime_bank_stats — self-scope it, then revoke PUBLIC.
--
-- Body is carried over verbatim from 2026-07-16-public-holiday.sql (the latest
-- definition) with two changes:
--   a) a caller check as the first statement, and
--   b) search_path reordered so pg_catalog resolves before public (H5): with
--      `public` first, an object created in the public schema can shadow a
--      built-in and would then run with the definer's rights.
--
-- The caller check is skipped when auth.uid() is null. That is deliberate and
-- required: the statement triggers in 2026-05-11-admin-perf-rpcs.sql
-- (tt_bank_statement_trigger) and every service-role code path call this with
-- no JWT context. When a normal user's own DML fires those triggers, auth.uid()
-- is their id and v_user is also their id (RLS guarantees they can only touch
-- their own rows), so the check passes there too.
-- ---------------------------------------------------------------------------
create or replace function public.tt_refresh_overtime_bank_stats(
  p_user uuid,
  p_today date default current_date
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_total integer := 0;
begin
  if p_user is null then
    return 0;
  end if;

  -- Callers acting under a user JWT may only refresh their own stats. A null
  -- auth.uid() means service_role or a trigger running as the definer.
  if auth.uid() is not null and auth.uid() <> p_user then
    raise exception 'tt_refresh_overtime_bank_stats: not authorized for another user'
      using errcode = '42501';
  end if;

  if not exists(select 1 from auth.users where id = p_user) then
    return 0;
  end if;

  select coalesce(
    sum(
      case
        when coalesce(logs.sick_leave, false) then 0
        when (coalesce(logs.holiday, false) or coalesce(logs.public_holiday, false))
          and coalesce(logs.net_mins, 0) = 0 then 0
        when (
          (extract(dow from dates.work_date)::int in (0, 6))
          and coalesce(logs.net_mins, 0) > 0
          and dates.work_date >= date '2026-04-01'
        )
          or (
            (coalesce(logs.holiday, false) or coalesce(logs.public_holiday, false))
            and coalesce(logs.net_mins, 0) > 0
          )
          then greatest(0, coalesce(logs.net_mins, 0)) - coalesce(comp.mins, 0)
        else greatest(0, coalesce(logs.net_mins, 0) - 504) - coalesce(comp.mins, 0)
      end
    ),
    0
  )
  into v_total
  from (
    select work_date
    from public.time_day_logs
    where user_id = p_user
    union
    select work_date
    from public.time_comp_adjustments
    where user_id = p_user
  ) dates
  left join public.time_day_logs logs
    on logs.user_id = p_user
   and logs.work_date = dates.work_date
  left join public.time_comp_adjustments comp
    on comp.user_id = p_user
   and comp.work_date = dates.work_date;

  insert into public.time_tracker_user_stats as stats (
    user_id,
    overtime_bank_mins,
    computed_for_day,
    updated_at
  )
  values (
    p_user,
    v_total,
    current_date,
    now()
  )
  on conflict (user_id) do update
    set overtime_bank_mins = excluded.overtime_bank_mins,
        computed_for_day = excluded.computed_for_day,
        updated_at = excluded.updated_at;

  return v_total;
end;
$$;

revoke all on function public.tt_refresh_overtime_bank_stats(uuid, date) from public;
grant execute on function public.tt_refresh_overtime_bank_stats(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. tt_resolve_audit_user_id — trigger helper only; nothing outside the audit
--    trigger should be able to call it. No re-grant: tt_audit_row_change() is
--    SECURITY DEFINER and runs as the owner, which retains EXECUTE.
--
-- Body carried over verbatim from time-tracker-durability.sql with only the
-- search_path reordered (H5).
-- ---------------------------------------------------------------------------
create or replace function public.tt_resolve_audit_user_id(
  p_table_name text,
  p_new_row jsonb,
  p_old_row jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  candidate uuid;
  day_log_id bigint;
begin
  candidate := coalesce(
    nullif(coalesce(p_new_row->>'user_id', p_old_row->>'user_id'), '')::uuid,
    null
  );
  if candidate is not null then
    return candidate;
  end if;

  if p_table_name = 'time_day_breaks' then
    day_log_id := coalesce(
      nullif(coalesce(p_new_row->>'day_log_id', p_old_row->>'day_log_id'), '')::bigint,
      null
    );
    if day_log_id is not null then
      select user_id into candidate
      from public.time_day_logs
      where id = day_log_id;
      return candidate;
    end if;
  end if;

  return null;
end;
$$;

revoke all on function public.tt_resolve_audit_user_id(text, jsonb, jsonb) from public;
revoke all on function public.tt_resolve_audit_user_id(text, jsonb, jsonb) from anon;
revoke all on function public.tt_resolve_audit_user_id(text, jsonb, jsonb) from authenticated;
