-- Admin panel performance overhaul.
--
-- Adds SQL-side aggregations for the four admin tabs that were doing
-- "pull rows into Node, group in JS":
--   * tt_admin_overview          -> one query for the per-user weekly table
--   * tt_workspace_summary       -> one query for the Insights workspace KPIs
--   * mail_recipient_week        -> one query for the Mail Tracking weekly view
--   * mail_link_leaderboard      -> one query for the Mail Tracking "by link" tab
--
-- Also converts the overtime-bank-stats triggers from FOR EACH ROW to FOR
-- EACH STATEMENT so a JSON import or 7-day week save no longer fires one
-- full-history recompute per row.
--
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Statement-level overtime-bank trigger
-- ---------------------------------------------------------------------------

create or replace function public.tt_bank_statement_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  for v_user in (
    select distinct user_id from rows where user_id is not null
  ) loop
    if exists(select 1 from auth.users where id = v_user) then
      perform public.tt_refresh_overtime_bank_stats(v_user, current_date);
    end if;
  end loop;
  return null;
end;
$$;

-- Drop the row-level triggers added by 2026-04-16-overtime-bank-stats.sql.
drop trigger if exists trg_tt_refresh_overtime_bank_stats_day_logs on public.time_day_logs;
drop trigger if exists trg_tt_refresh_overtime_bank_stats_comp on public.time_comp_adjustments;

-- Also drop any older versions of the per-event statement triggers so this
-- migration is idempotent.
drop trigger if exists trg_tt_bank_stmt_day_logs_ins on public.time_day_logs;
drop trigger if exists trg_tt_bank_stmt_day_logs_upd on public.time_day_logs;
drop trigger if exists trg_tt_bank_stmt_day_logs_del on public.time_day_logs;
drop trigger if exists trg_tt_bank_stmt_comp_ins on public.time_comp_adjustments;
drop trigger if exists trg_tt_bank_stmt_comp_upd on public.time_comp_adjustments;
drop trigger if exists trg_tt_bank_stmt_comp_del on public.time_comp_adjustments;

create trigger trg_tt_bank_stmt_day_logs_ins
after insert on public.time_day_logs
referencing new table as rows
for each statement execute function public.tt_bank_statement_trigger();

create trigger trg_tt_bank_stmt_day_logs_upd
after update on public.time_day_logs
referencing new table as rows
for each statement execute function public.tt_bank_statement_trigger();

create trigger trg_tt_bank_stmt_day_logs_del
after delete on public.time_day_logs
referencing old table as rows
for each statement execute function public.tt_bank_statement_trigger();

create trigger trg_tt_bank_stmt_comp_ins
after insert on public.time_comp_adjustments
referencing new table as rows
for each statement execute function public.tt_bank_statement_trigger();

create trigger trg_tt_bank_stmt_comp_upd
after update on public.time_comp_adjustments
referencing new table as rows
for each statement execute function public.tt_bank_statement_trigger();

create trigger trg_tt_bank_stmt_comp_del
after delete on public.time_comp_adjustments
referencing old table as rows
for each statement execute function public.tt_bank_statement_trigger();

-- ---------------------------------------------------------------------------
-- 2. tt_admin_overview
--
-- Returns one row per auth.users user with the figures the admin "Time
-- overview" tab needs. Replaces the per-user N x fetchWeekForUser loop in
-- /api/admin/time-overview/route.ts.
--
-- weekly_total_mins   sum of net_mins across the 7-day window starting at
--                     p_week_start (Monday).
-- missing_days        count of weekdays (Mon-Fri) inside the window where
--                     the user is not on holiday and net_mins + comp_mins
--                     is below the 504 minute target.
-- overtime_bank_mins  read straight from the time_tracker_user_stats cache
--                     that the bank trigger keeps fresh.
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
      coalesce(l.holiday, false) as holiday
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
        where not holiday and (net_mins + comp_mins) < 504
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

-- ---------------------------------------------------------------------------
-- 3. tt_workspace_summary
--
-- Two sums that the Insights tab needs. Replaces the two
-- time_day_logs.select('net_mins') scans in /api/admin/insights/route.ts.
-- Returns integer minutes; the route divides to hours.
-- ---------------------------------------------------------------------------

create or replace function public.tt_workspace_summary(
  p_week_start_date date,
  p_month_start_date date
)
returns table (
  week_mins integer,
  month_mins integer
)
language sql
security definer
stable
set search_path = public, pg_catalog
as $$
  select
    coalesce(
      (select sum(net_mins)::int from public.time_day_logs
        where work_date >= p_week_start_date),
      0
    ) as week_mins,
    coalesce(
      (select sum(net_mins)::int from public.time_day_logs
        where work_date >= p_month_start_date),
      0
    ) as month_mins
$$;

revoke all on function public.tt_workspace_summary(date, date) from public;
grant execute on function public.tt_workspace_summary(date, date) to service_role;

-- ---------------------------------------------------------------------------
-- 4. mail_recipient_week
--
-- Replaces the 3-stage fetch-and-aggregate-in-Node path in
-- /api/admin/mail-tracking/route.ts. Groups by lower(recipient_name) plus
-- lower(coalesce(company_name, '')) to mirror the JS recipientKey().
-- Returns one row per group plus a totals object at the top level.
-- ---------------------------------------------------------------------------

create or replace function public.mail_recipient_week(
  p_week_start timestamptz,
  p_week_end timestamptz
)
returns jsonb
language sql
security definer
stable
set search_path = public, pg_catalog
as $$
  with week_sends as (
    select id, user_id, recipient_name, company_name, created_at
    from public.mail_sends
    where created_at >= p_week_start and created_at < p_week_end
  ),
  send_clicks as (
    select
      l.send_id,
      count(*) filter (where not c.is_likely_bot)::int as real_clicks,
      count(*) filter (where c.is_likely_bot)::int as bot_clicks,
      max(c.clicked_at) as last_click_at
    from public.mail_send_links l
    join public.mail_link_clicks c on c.link_id = l.id
    where l.send_id in (select id from week_sends)
    group by l.send_id
  ),
  per_send as (
    select
      s.id,
      s.user_id,
      s.recipient_name,
      s.company_name,
      s.created_at,
      coalesce(sc.real_clicks, 0) as real_clicks,
      coalesce(sc.bot_clicks, 0) as bot_clicks,
      sc.last_click_at
    from week_sends s
    left join send_clicks sc on sc.send_id = s.id
  ),
  groups as (
    select
      lower(recipient_name) || '|' || lower(coalesce(company_name, '')) as key,
      max(recipient_name) as recipient_name,
      max(company_name) as company_name,
      count(*)::int as sends_count,
      count(distinct user_id)::int as unique_senders,
      sum(real_clicks)::int as real_clicks,
      sum(bot_clicks)::int as bot_clicks,
      max(last_click_at) as last_click_at,
      max(created_at) as last_send_at,
      array_agg(id order by created_at desc) as send_ids
    from per_send
    group by lower(recipient_name), lower(coalesce(company_name, ''))
  ),
  sorted as (
    select * from groups
    order by
      (last_click_at is null),
      last_click_at desc,
      last_send_at desc
  )
  select jsonb_build_object(
    'recipients',
      coalesce(
        (select jsonb_agg(
          jsonb_build_object(
            'key', key,
            'recipient_name', recipient_name,
            'company_name', company_name,
            'sends_count', sends_count,
            'unique_senders', unique_senders,
            'real_clicks', real_clicks,
            'bot_clicks', bot_clicks,
            'last_click_at', last_click_at,
            'last_send_at', last_send_at,
            'send_ids', to_jsonb(send_ids)
          )
        ) from sorted),
        '[]'::jsonb
      ),
    'totals', jsonb_build_object(
      'mails_sent', coalesce((select sum(sends_count)::int from groups), 0),
      'recipients', coalesce((select count(*)::int from groups), 0),
      'real_clicks', coalesce((select sum(real_clicks)::int from groups), 0),
      'bot_clicks', coalesce((select sum(bot_clicks)::int from groups), 0)
    )
  )
$$;

revoke all on function public.mail_recipient_week(timestamptz, timestamptz) from public;
grant execute on function public.mail_recipient_week(timestamptz, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 5. mail_link_leaderboard
--
-- Replaces the unbounded fetchAllRows paginator in
-- /api/admin/mail-tracking/links/route.ts. Groups by the same canonical key
-- the JS used: prefer link_key when present, fall back to original_url.
-- Returns the top p_limit groups plus a totals object computed across the
-- full table set.
-- ---------------------------------------------------------------------------

create or replace function public.mail_link_leaderboard(
  p_limit integer default 500
)
returns jsonb
language sql
security definer
stable
set search_path = public, pg_catalog
as $$
  with all_links as (
    select
      id,
      send_id,
      original_url,
      link_label,
      link_key,
      created_at,
      case
        when nullif(link_key, '') is not null then 'key:' || link_key
        else 'url:' || original_url
      end as key
    from public.mail_send_links
  ),
  link_summary as (
    select
      key,
      (array_agg(original_url order by created_at asc))[1] as original_url,
      (array_agg(link_label order by created_at asc)
        filter (where coalesce(link_label, '') <> ''))[1] as label,
      (array_agg(link_key order by created_at asc)
        filter (where coalesce(link_key, '') <> ''))[1] as link_key,
      count(distinct send_id)::int as sends_count,
      min(created_at) as first_sent_at
    from all_links
    group by key
  ),
  click_agg as (
    select
      l.key,
      count(*) filter (where not c.is_likely_bot)::int as real_clicks,
      count(*) filter (where c.is_likely_bot)::int as bot_clicks,
      max(c.clicked_at) as last_click_at
    from all_links l
    join public.mail_link_clicks c on c.link_id = l.id
    group by l.key
  ),
  merged as (
    select
      s.key,
      s.original_url,
      s.label,
      s.link_key,
      s.sends_count,
      coalesce(ca.real_clicks, 0) as real_clicks,
      coalesce(ca.bot_clicks, 0) as bot_clicks,
      ca.last_click_at,
      s.first_sent_at
    from link_summary s
    left join click_agg ca on ca.key = s.key
  ),
  ranked as (
    select * from merged
    order by real_clicks desc, bot_clicks desc, sends_count desc
    limit p_limit
  ),
  totals as (
    select
      (select count(*)::int from link_summary) as unique_links,
      (select count(*)::int from public.mail_send_links) as total_link_rows,
      coalesce(
        (select count(*)::int from public.mail_link_clicks where not is_likely_bot),
        0
      ) as real_clicks,
      coalesce(
        (select count(*)::int from public.mail_link_clicks where is_likely_bot),
        0
      ) as bot_clicks
  )
  select jsonb_build_object(
    'links',
      coalesce(
        (select jsonb_agg(
          jsonb_build_object(
            'key', key,
            'original_url', original_url,
            'label', label,
            'link_key', link_key,
            'sends_count', sends_count,
            'real_clicks', real_clicks,
            'bot_clicks', bot_clicks,
            'last_click_at', last_click_at,
            'first_sent_at', first_sent_at
          )
        ) from ranked),
        '[]'::jsonb
      ),
    'totals', (select to_jsonb(totals.*) from totals)
  )
$$;

revoke all on function public.mail_link_leaderboard(integer) from public;
grant execute on function public.mail_link_leaderboard(integer) to service_role;
