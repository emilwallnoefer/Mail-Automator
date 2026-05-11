-- Timeline buckets for the admin Mail Tracking chart.
--
-- Returns aggregated mail send and click counts across all tracked mail
-- sources for a chosen period:
--   day   -> hourly buckets for the selected day
--   week  -> daily buckets for the selected week
--   month -> daily buckets for the selected month
--   year  -> monthly buckets for the selected year
--
-- Safe to re-run.

create or replace function public.mail_click_timeline(
  p_period text default 'week',
  p_anchor timestamptz default now()
)
returns jsonb
language sql
security definer
stable
set search_path = public, pg_catalog
as $$
  with params as (
    select
      case
        when p_period = 'day' then date_trunc('day', p_anchor)
        when p_period = 'month' then date_trunc('month', p_anchor)
        when p_period = 'year' then date_trunc('year', p_anchor)
        else date_trunc('week', p_anchor)
      end as range_start,
      case
        when p_period = 'day' then date_trunc('day', p_anchor) + interval '1 day'
        when p_period = 'month' then date_trunc('month', p_anchor) + interval '1 month'
        when p_period = 'year' then date_trunc('year', p_anchor) + interval '1 year'
        else date_trunc('week', p_anchor) + interval '1 week'
      end as range_end,
      case
        when p_period = 'day' then interval '1 hour'
        when p_period = 'year' then interval '1 month'
        else interval '1 day'
      end as bucket_step,
      case
        when p_period = 'day' then 'hour'
        when p_period = 'year' then 'month'
        else 'day'
      end as bucket_unit
  ),
  buckets as (
    select gs as bucket_start
    from params p,
    generate_series(p.range_start, p.range_end - p.bucket_step, p.bucket_step) as gs
  ),
  send_agg as (
    select
      date_trunc(p.bucket_unit, s.created_at) as bucket_start,
      count(*)::int as mails_sent
    from public.mail_sends s
    cross join params p
    where s.created_at >= p.range_start
      and s.created_at < p.range_end
    group by 1
  ),
  click_agg as (
    select
      date_trunc(p.bucket_unit, c.clicked_at) as bucket_start,
      count(*) filter (where not c.is_likely_bot)::int as real_clicks,
      count(*) filter (where c.is_likely_bot)::int as bot_clicks
    from public.mail_link_clicks c
    cross join params p
    where c.clicked_at >= p.range_start
      and c.clicked_at < p.range_end
    group by 1
  ),
  merged as (
    select
      b.bucket_start,
      coalesce(sa.mails_sent, 0)::int as mails_sent,
      coalesce(ca.real_clicks, 0)::int as real_clicks,
      coalesce(ca.bot_clicks, 0)::int as bot_clicks
    from buckets b
    left join send_agg sa on sa.bucket_start = b.bucket_start
    left join click_agg ca on ca.bucket_start = b.bucket_start
    order by b.bucket_start
  )
  select jsonb_build_object(
    'period', case
      when p_period in ('day', 'week', 'month', 'year') then p_period
      else 'week'
    end,
    'anchor', p_anchor,
    'range_start', (select range_start from params),
    'range_end', (select range_end from params),
    'buckets', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'bucket_start', bucket_start,
            'mails_sent', mails_sent,
            'real_clicks', real_clicks,
            'bot_clicks', bot_clicks
          )
          order by bucket_start
        )
        from merged
      ),
      '[]'::jsonb
    ),
    'totals', jsonb_build_object(
      'mails_sent', coalesce((select sum(mails_sent)::int from merged), 0),
      'real_clicks', coalesce((select sum(real_clicks)::int from merged), 0),
      'bot_clicks', coalesce((select sum(bot_clicks)::int from merged), 0)
    )
  )
$$;

revoke all on function public.mail_click_timeline(text, timestamptz) from public;
grant execute on function public.mail_click_timeline(text, timestamptz) to service_role;
