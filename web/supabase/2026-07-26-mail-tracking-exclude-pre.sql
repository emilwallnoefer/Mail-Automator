-- Exclude pre-training mails from the admin Mail Tracking views.
--
-- Pre-training mails render no link blocks at all (see renderMail(): every
-- USEFUL_LINKS / TRAINING_MATERIALS / INDUSTRY_TRAINING / ADDONS block is
-- empty when the template is a `pre_*` one), so a pre-mail never produces a
-- mail_send_links row and can never be clicked. Counting those sends in the
-- Mail Tracking tab only inflates "mails sent" / recipient rows and drags the
-- apparent click-through rate down.
--
-- This migration re-creates the five read RPCs behind the tab with the same
-- bodies as before plus one predicate on public.mail_sends:
--
--     coalesce(mail_type, '') <> 'pre'
--
-- Nothing is deleted: the mail_sends rows stay, they are just not read by the
-- tracking views. Click-side aggregates are untouched — a click can only exist
-- via a mail_send_links row, which pre-mails never have.
--
-- Touches: mail_recipient_recent, mail_recipient_week, mail_recipient_search,
--          mail_overview_stats, mail_click_timeline.
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. mail_recipient_recent  (was 2026-06-02-mail-perf-rpcs.sql)
-- ---------------------------------------------------------------------------

create or replace function public.mail_recipient_recent(
  p_limit integer default 10,
  p_offset integer default 0
)
returns jsonb
language sql
security definer
stable
set search_path = public, pg_catalog
as $$
  with tracked_sends as (
    select id, user_id, recipient_name, company_name, created_at
    from public.mail_sends
    where coalesce(mail_type, '') <> 'pre'
  ),
  groups as (
    select
      lower(coalesce(recipient_name, '')) || '|' || lower(coalesce(company_name, '')) as key,
      max(recipient_name) as recipient_name,
      max(company_name) as company_name,
      count(*)::int as sends_count,
      count(distinct user_id)::int as unique_senders,
      max(created_at) as last_send_at,
      array_agg(id order by created_at desc) as send_ids
    from tracked_sends
    group by lower(coalesce(recipient_name, '')), lower(coalesce(company_name, ''))
  ),
  page as (
    select * from groups
    order by last_send_at desc
    limit greatest(p_limit, 0) offset greatest(p_offset, 0)
  ),
  page_send_ids as (
    select key, unnest(send_ids) as send_id from page
  ),
  page_clicks as (
    select
      ps.key,
      count(*) filter (where not c.is_likely_bot)::int as real_clicks,
      count(*) filter (where c.is_likely_bot)::int as bot_clicks,
      max(c.clicked_at) as last_click_at
    from page_send_ids ps
    join public.mail_send_links l on l.send_id = ps.send_id
    join public.mail_link_clicks c on c.link_id = l.id
    group by ps.key
  ),
  final as (
    select
      p.key,
      p.recipient_name,
      p.company_name,
      p.sends_count,
      p.unique_senders,
      coalesce(pc.real_clicks, 0) as real_clicks,
      coalesce(pc.bot_clicks, 0) as bot_clicks,
      pc.last_click_at,
      p.last_send_at,
      p.send_ids
    from page p
    left join page_clicks pc on pc.key = p.key
  ),
  totals as (
    select
      (select count(*)::int from tracked_sends) as mails_sent,
      (select count(*)::int from groups) as recipients,
      coalesce((select count(*)::int from public.mail_link_clicks where not is_likely_bot), 0) as real_clicks,
      coalesce((select count(*)::int from public.mail_link_clicks where is_likely_bot), 0) as bot_clicks
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
          order by last_send_at desc
        ) from final),
        '[]'::jsonb
      ),
    'total', (select recipients from totals),
    'totals', jsonb_build_object(
      'mails_sent', (select mails_sent from totals),
      'recipients', (select recipients from totals),
      'real_clicks', (select real_clicks from totals),
      'bot_clicks', (select bot_clicks from totals)
    )
  )
$$;

revoke all on function public.mail_recipient_recent(integer, integer) from public;
grant execute on function public.mail_recipient_recent(integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 2. mail_recipient_week  (was 2026-05-11-admin-perf-rpcs.sql)
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
      and coalesce(mail_type, '') <> 'pre'
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
-- 3. mail_recipient_search  (was 2026-05-11-mail-recipient-search.sql)
-- ---------------------------------------------------------------------------

create or replace function public.mail_recipient_search(
  p_query text,
  p_limit integer default 200
)
returns jsonb
language sql
security definer
stable
set search_path = public, pg_catalog
as $$
  with q as (
    select '%' || lower(coalesce(p_query, '')) || '%' as pattern
  ),
  matched_sends as (
    select s.id, s.user_id, s.recipient_name, s.recipient_email,
           s.company_name, s.created_at
    from public.mail_sends s, q
    where coalesce(s.mail_type, '') <> 'pre'
      and (
        lower(s.recipient_name) like q.pattern
        or lower(coalesce(s.company_name, '')) like q.pattern
        or lower(coalesce(s.recipient_email, '')) like q.pattern
      )
  ),
  send_clicks as (
    select
      l.send_id,
      count(*) filter (where not c.is_likely_bot)::int as real_clicks,
      count(*) filter (where c.is_likely_bot)::int as bot_clicks,
      max(c.clicked_at) as last_click_at
    from public.mail_send_links l
    join public.mail_link_clicks c on c.link_id = l.id
    where l.send_id in (select id from matched_sends)
    group by l.send_id
  ),
  per_send as (
    select
      s.id, s.user_id, s.recipient_name, s.company_name, s.created_at,
      coalesce(sc.real_clicks, 0) as real_clicks,
      coalesce(sc.bot_clicks, 0) as bot_clicks,
      sc.last_click_at
    from matched_sends s
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
    limit p_limit
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
      'bot_clicks', coalesce((select sum(bot_clicks)::int from groups), 0),
      'truncated', coalesce(
        (select (select count(*) from groups) > p_limit),
        false
      )
    )
  )
$$;

revoke all on function public.mail_recipient_search(text, integer) from public;
grant execute on function public.mail_recipient_search(text, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 4. mail_overview_stats  (was 2026-06-02-mail-perf-rpcs.sql)
-- ---------------------------------------------------------------------------

create or replace function public.mail_overview_stats(
  p_range_start timestamptz,
  p_top_limit integer default 8
)
returns jsonb
language sql
security definer
stable
set search_path = public, pg_catalog
as $$
  with range_sends as (
    select id, recipient_name, company_name, coalesce(nullif(mail_type, ''), 'unknown') as mail_type
    from public.mail_sends
    where created_at >= p_range_start
      and coalesce(mail_type, '') <> 'pre'
  ),
  range_links as (
    select
      l.id,
      l.send_id,
      l.original_url,
      l.link_label,
      l.link_key,
      l.created_at,
      case
        when nullif(l.link_key, '') is not null then 'key:' || l.link_key
        else 'url:' || l.original_url
      end as link_group_key
    from public.mail_send_links l
    where l.send_id in (select id from range_sends)
  ),
  range_clicks as (
    select c.link_id, c.clicked_at, c.is_likely_bot
    from public.mail_link_clicks c
    where c.link_id in (select id from range_links)
      and c.clicked_at >= p_range_start
  ),
  click_join as (
    select
      rc.is_likely_bot,
      rc.clicked_at,
      rl.link_group_key,
      lower(btrim(coalesce(rs.recipient_name, ''))) || '::' || lower(btrim(coalesce(rs.company_name, ''))) as rec_key,
      rs.mail_type
    from range_clicks rc
    join range_links rl on rl.id = rc.link_id
    join range_sends rs on rs.id = rl.send_id
  ),
  -- Recipients: sends from range_sends, clicks from click_join.
  rec_sends as (
    select
      lower(btrim(coalesce(recipient_name, ''))) || '::' || lower(btrim(coalesce(company_name, ''))) as key,
      max(recipient_name) as name,
      max(company_name) as company,
      count(*)::int as sends_count
    from range_sends
    group by lower(btrim(coalesce(recipient_name, ''))), lower(btrim(coalesce(company_name, '')))
  ),
  rec_clicks as (
    select
      rec_key as key,
      count(*) filter (where not is_likely_bot)::int as real_clicks,
      count(*) filter (where is_likely_bot)::int as bot_clicks
    from click_join
    group by rec_key
  ),
  top_recipients as (
    select
      rs.key, rs.name, rs.company, rs.sends_count,
      coalesce(rc.real_clicks, 0) as real_clicks,
      coalesce(rc.bot_clicks, 0) as bot_clicks
    from rec_sends rs
    left join rec_clicks rc on rc.key = rs.key
    order by coalesce(rc.real_clicks, 0) desc, rs.sends_count desc
    limit greatest(p_top_limit, 0)
  ),
  -- Links: sends_count is the number of link rows in the group (matches the
  -- previous per-link-row increment), clicks from click_join.
  link_first as (
    select distinct on (link_group_key)
      link_group_key as key,
      link_label,
      link_key,
      original_url
    from range_links
    order by link_group_key, created_at asc, id asc
  ),
  link_counts as (
    select link_group_key as key, count(*)::int as sends_count
    from range_links
    group by link_group_key
  ),
  link_clicks as (
    select
      link_group_key as key,
      count(*) filter (where not is_likely_bot)::int as real_clicks,
      count(*) filter (where is_likely_bot)::int as bot_clicks
    from click_join
    group by link_group_key
  ),
  top_links as (
    select
      lf.key,
      coalesce(nullif(lf.link_label, ''), nullif(lf.link_key, ''), lf.original_url) as label,
      lf.link_key,
      lf.original_url,
      lc.sends_count,
      coalesce(lk.real_clicks, 0) as real_clicks,
      coalesce(lk.bot_clicks, 0) as bot_clicks
    from link_first lf
    join link_counts lc on lc.key = lf.key
    left join link_clicks lk on lk.key = lf.key
    order by coalesce(lk.real_clicks, 0) desc, lc.sends_count desc
    limit greatest(p_top_limit, 0)
  ),
  -- Mail-type breakdown across the whole window.
  mt_sends as (
    select mail_type, count(*)::int as sends_count
    from range_sends
    group by mail_type
  ),
  mt_clicks as (
    select
      mail_type,
      count(*) filter (where not is_likely_bot)::int as real_clicks,
      count(*) filter (where is_likely_bot)::int as bot_clicks
    from click_join
    group by mail_type
  ),
  mail_types as (
    select
      ms.mail_type,
      ms.sends_count,
      coalesce(mc.real_clicks, 0) as real_clicks,
      coalesce(mc.bot_clicks, 0) as bot_clicks
    from mt_sends ms
    left join mt_clicks mc on mc.mail_type = ms.mail_type
    order by ms.sends_count desc
  ),
  -- Hour-of-week heatmap cells (UTC). Monday=0..Sunday=6.
  heatmap as (
    select
      (extract(isodow from (clicked_at at time zone 'UTC'))::int - 1) as dow,
      extract(hour from (clicked_at at time zone 'UTC'))::int as hour,
      count(*) filter (where not is_likely_bot)::int as real_clicks,
      count(*) filter (where is_likely_bot)::int as bot_clicks
    from click_join
    group by 1, 2
  )
  select jsonb_build_object(
    'top_recipients',
      coalesce((select jsonb_agg(jsonb_build_object(
        'key', key, 'name', name, 'company', company,
        'real_clicks', real_clicks, 'bot_clicks', bot_clicks, 'sends_count', sends_count
      )) from top_recipients), '[]'::jsonb),
    'top_links',
      coalesce((select jsonb_agg(jsonb_build_object(
        'key', key, 'label', label, 'link_key', link_key, 'original_url', original_url,
        'real_clicks', real_clicks, 'bot_clicks', bot_clicks, 'sends_count', sends_count
      )) from top_links), '[]'::jsonb),
    'mail_type_breakdown',
      coalesce((select jsonb_agg(jsonb_build_object(
        'mail_type', mail_type, 'sends_count', sends_count,
        'real_clicks', real_clicks, 'bot_clicks', bot_clicks
      )) from mail_types), '[]'::jsonb),
    'heatmap_cells',
      coalesce((select jsonb_agg(jsonb_build_object(
        'dow', dow, 'hour', hour, 'real', real_clicks, 'bot', bot_clicks
      )) from heatmap), '[]'::jsonb),
    'totals', jsonb_build_object(
      'sends_count', (select count(*)::int from range_sends),
      'real_clicks', coalesce((select count(*)::int from click_join where not is_likely_bot), 0),
      'bot_clicks', coalesce((select count(*)::int from click_join where is_likely_bot), 0)
    )
  )
$$;

revoke all on function public.mail_overview_stats(timestamptz, integer) from public;
grant execute on function public.mail_overview_stats(timestamptz, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 5. mail_click_timeline  (was 2026-05-12-mail-click-timeline.sql)
--
-- Only the send series needs the filter; click_agg reads mail_link_clicks
-- directly and pre-mails never own a link row. Keeping click_agg unjoined also
-- preserves clicks whose parent send has since been deleted (send_id null,
-- see 2026-06-02-mail-links-survive-send-delete.sql).
-- ---------------------------------------------------------------------------

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
      and coalesce(s.mail_type, '') <> 'pre'
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
