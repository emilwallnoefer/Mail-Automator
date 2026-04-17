-- Prevent "Database error deleting user" when deleting an auth.users row.
--
-- Background:
--   When a user is deleted from auth.users, Postgres cascades the delete to
--   time_day_logs and time_comp_adjustments (both have ON DELETE CASCADE).
--   Those cascaded deletes fire the AFTER DELETE trigger
--   trg_tt_refresh_overtime_bank_stats_*, which calls
--   tt_refresh_overtime_bank_stats(user_id). That function does an
--   INSERT ... ON CONFLICT DO UPDATE into time_tracker_user_stats, which has
--   user_id REFERENCES auth.users(id) ON DELETE CASCADE. Because the parent
--   auth.users row is in the middle of being deleted, the FK check on that
--   INSERT fails with foreign_key_violation, and Supabase surfaces it as the
--   generic "Database error deleting user" from the Auth admin API.
--
-- Fix:
--   Skip the refresh when the user no longer exists in auth.users. The row in
--   time_tracker_user_stats will be cascade-deleted anyway, so recomputing it
--   is pointless.

create or replace function public.tt_refresh_overtime_bank_stats_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_exists boolean;
begin
  v_user := coalesce(new.user_id, old.user_id);

  if v_user is null then
    return null;
  end if;

  select exists(select 1 from auth.users where id = v_user) into v_exists;
  if not v_exists then
    return null;
  end if;

  perform public.tt_refresh_overtime_bank_stats(v_user, current_date);
  return null;
end;
$$;

-- Belt-and-braces: also guard the callable function itself, in case it is
-- invoked from any other context (e.g. a future trigger or RPC).
create or replace function public.tt_refresh_overtime_bank_stats(
  p_user uuid,
  p_today date default current_date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer := 0;
begin
  if p_user is null then
    return 0;
  end if;

  if not exists(select 1 from auth.users where id = p_user) then
    return 0;
  end if;

  select coalesce(
    sum(
      case
        when coalesce(logs.holiday, false) and coalesce(logs.net_mins, 0) = 0 then 0
        when (
          (extract(dow from dates.work_date)::int in (0, 6))
          and coalesce(logs.net_mins, 0) > 0
          and dates.work_date >= date '2026-04-01'
        )
          or (coalesce(logs.holiday, false) and coalesce(logs.net_mins, 0) > 0)
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

grant execute on function public.tt_refresh_overtime_bank_stats(uuid, date) to authenticated;
