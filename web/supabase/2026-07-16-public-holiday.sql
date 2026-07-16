-- Split the old "Holiday" day type into "Vacation" and "Public Holiday".
--
-- The existing `holiday` column now means Vacation in the UI; this adds a
-- separate `public_holiday` flag as the fourth day type. Both share the same
-- accounting rule (unchanged from the old Holiday behavior):
--   Excused from the daily target (never a missing weekday, never a deficit),
--   and any hours logged count fully as overtime (same as a weekend).
-- Existing rows keep their meaning — no data migration needed.
--
-- Safe to re-run.

alter table public.time_day_logs
  add column if not exists public_holiday boolean not null default false;

-- ---------------------------------------------------------------------------
-- 1. Overtime bank: a public holiday behaves exactly like the old holiday
--    flag. Mirrors the latest definition in 2026-06-01-sick-leave.sql with
--    `holiday` widened to `holiday or public_holiday`.
-- ---------------------------------------------------------------------------
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

grant execute on function public.tt_refresh_overtime_bank_stats(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Week read RPC: surface public_holiday per log.
-- ---------------------------------------------------------------------------
create or replace function public.tt_user_week_v1(p_week_start date)
returns jsonb
language sql
security definer
stable
set search_path = public, pg_catalog
as $$
  with me as (
    select auth.uid() as user_id
  ),
  week_logs as (
    select l.id, l.work_date, l.start_time, l.stop_time, l.net_mins, l.holiday, l.sick_leave, l.public_holiday
    from public.time_day_logs l
    join me on me.user_id is not null and l.user_id = me.user_id
    where l.work_date >= p_week_start
      and l.work_date < (p_week_start + 7)
    order by l.work_date asc
  ),
  week_comp as (
    select c.work_date, c.mins, c.note
    from public.time_comp_adjustments c
    join me on me.user_id is not null and c.user_id = me.user_id
    where c.work_date >= p_week_start
      and c.work_date < (p_week_start + 7)
    order by c.work_date asc
  ),
  week_breaks as (
    select b.day_log_id, b.position, b.name, b.mins
    from public.time_day_breaks b
    where b.day_log_id in (select id from week_logs)
    order by b.day_log_id asc, b.position asc
  )
  select jsonb_build_object(
    'logs', coalesce(
      (select jsonb_agg(
        jsonb_build_object(
          'id', l.id,
          'work_date', to_char(l.work_date, 'YYYY-MM-DD'),
          'start_time', l.start_time,
          'stop_time', l.stop_time,
          'net_mins', l.net_mins,
          'holiday', l.holiday,
          'sick_leave', l.sick_leave,
          'public_holiday', l.public_holiday
        )
        order by l.work_date asc
      ) from week_logs l),
      '[]'::jsonb
    ),
    'comp', coalesce(
      (select jsonb_agg(
        jsonb_build_object(
          'work_date', to_char(c.work_date, 'YYYY-MM-DD'),
          'mins', c.mins,
          'note', c.note
        )
        order by c.work_date asc
      ) from week_comp c),
      '[]'::jsonb
    ),
    'breaks', coalesce(
      (select jsonb_agg(
        jsonb_build_object(
          'day_log_id', b.day_log_id,
          'position', b.position,
          'name', b.name,
          'mins', b.mins
        )
        order by b.day_log_id asc, b.position asc
      ) from week_breaks b),
      '[]'::jsonb
    ),
    'bank_mins', coalesce(
      (select s.overtime_bank_mins
       from public.time_tracker_user_stats s
       join me on me.user_id is not null and s.user_id = me.user_id),
      0
    )
  );
$$;

revoke all on function public.tt_user_week_v1(date) from public;
grant execute on function public.tt_user_week_v1(date) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Admin overview: public holidays are excused, so exclude them from
--    missing days (same as vacation/sick leave).
-- ---------------------------------------------------------------------------
create or replace function public.tt_admin_overview(
  p_week_start date
)
returns table (
  user_id uuid,
  weekly_total_mins integer,
  missing_days integer,
  overtime_bank_mins integer,
  target_mins integer
)
language sql
security definer
stable
set search_path = public, pg_catalog
as $$
  with all_users as (
    select id as user_id from auth.users
  ),
  weekday_dates as (
    select (p_week_start + offs)::date as work_date
    from generate_series(0, 4) as offs
  ),
  weekday_grid as (
    select u.user_id, d.work_date
    from all_users u
    cross join weekday_dates d
  ),
  weekday_status as (
    select
      g.user_id,
      g.work_date,
      coalesce(l.net_mins, 0) as net_mins,
      coalesce(c.mins, 0) as comp_mins,
      (coalesce(l.holiday, false) or coalesce(l.public_holiday, false)) as holiday,
      coalesce(l.sick_leave, false) as sick_leave
    from weekday_grid g
    left join public.time_day_logs l
      on l.user_id = g.user_id and l.work_date = g.work_date
    left join public.time_comp_adjustments c
      on c.user_id = g.user_id and c.work_date = g.work_date
  ),
  missing as (
    select
      user_id,
      count(*) filter (
        where not holiday and not sick_leave and (net_mins + comp_mins) < 504
      )::int as missing_days
    from weekday_status
    group by user_id
  ),
  week_totals as (
    select
      user_id,
      coalesce(sum(net_mins), 0)::int as weekly_total_mins
    from public.time_day_logs
    where work_date >= p_week_start
      and work_date < (p_week_start + 7)
    group by user_id
  )
  select
    u.user_id,
    coalesce(w.weekly_total_mins, 0)::int as weekly_total_mins,
    coalesce(m.missing_days, 0)::int as missing_days,
    coalesce(s.overtime_bank_mins, 0)::int as overtime_bank_mins,
    504 as target_mins
  from all_users u
  left join week_totals w on w.user_id = u.user_id
  left join missing m on m.user_id = u.user_id
  left join public.time_tracker_user_stats s on s.user_id = u.user_id
$$;

revoke all on function public.tt_admin_overview(date) from public;
grant execute on function public.tt_admin_overview(date) to service_role;
