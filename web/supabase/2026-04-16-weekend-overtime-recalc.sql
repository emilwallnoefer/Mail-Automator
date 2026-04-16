-- Recalculate overtime bank using permanent weekend overtime rules.
-- Safe to run after 2026-04-16-overtime-bank-stats.sql has already been applied.

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

do $$
declare
  v_user uuid;
begin
  for v_user in
    select user_id from public.time_day_logs
    union
    select user_id from public.time_comp_adjustments
  loop
    perform public.tt_refresh_overtime_bank_stats(v_user, current_date);
  end loop;
end;
$$;
