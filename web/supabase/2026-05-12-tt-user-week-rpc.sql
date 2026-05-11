-- Single-roundtrip week read for the Hour Logger.
--
-- Returns the 7-day grid of logs, breaks, comp adjustments, and the cached
-- overtime bank for the currently authenticated user in one call. Replaces
-- the four sequential Supabase queries that fetchWeekForUser used to do
-- (logs + comp parallel, then breaks, then time_tracker_user_stats).
--
-- Authorization: SECURITY DEFINER, but the function only ever reads rows
-- belonging to auth.uid(). If auth.uid() is null (no session) the function
-- returns empty arrays and bank_mins = 0.
--
-- Safe to re-run.

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
    select l.id, l.work_date, l.start_time, l.stop_time, l.net_mins, l.holiday
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
          'holiday', l.holiday
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
