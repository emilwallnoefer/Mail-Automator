-- Mail-tracking performance pass.
--
-- Replaces two heavy in-memory scans in the admin API with set-based RPCs and
-- adds the index the click-count queries were missing:
--
--   1. idx_mail_link_clicks_real_clicked — partial index so the "real clicks"
--      filters (clicked_at range + is_likely_bot = false) and the all-time
--      real/bot count(*) queries stop sequential-scanning the whole clicks
--      table.
--   2. mail_recipient_recent — replaces recentRecipients() in
--      /api/admin/mail-tracking/route.ts, which fetched up to 10,000 mail_sends
--      rows into Node just to group + paginate in JS.
--   3. mail_overview_stats — replaces /api/admin/mail-tracking/overview-stats,
--      which fetched up to 5,000 sends + all their links + all their clicks to
--      compute top-N lists and a heatmap in JS.
--
-- Run once in the Supabase SQL Editor (or via the hand-applied migration flow).

-- ---------------------------------------------------------------------------
-- 1. Partial index for the "real clicks" reads.
-- ---------------------------------------------------------------------------

-- Speeds up `where clicked_at >= X and is_likely_bot = false order by clicked_at`
-- (clicks listing) and the all-time `count(*) where not is_likely_bot` tiles.
create index if not exists idx_mail_link_clicks_real_clicked
  on public.mail_link_clicks (clicked_at desc)
  where not is_likely_bot;

-- Covers the symmetric `count(*) where is_likely_bot` tile.
create index if not exists idx_mail_link_clicks_is_bot
  on public.mail_link_clicks (is_likely_bot);

-- ---------------------------------------------------------------------------
-- 2. mail_recipient_recent
--
-- All-time recipient list ordered by recency (newest send first), paged with
-- limit/offset. Click stats are resolved for the requested page only; the
-- totals object is computed across the full dataset. Recipient grouping uses
-- the same canonical key the JS used: lower(name)|lower(company).
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
  with groups as (
    select
      lower(coalesce(recipient_name, '')) || '|' || lower(coalesce(company_name, '')) as key,
      max(recipient_name) as recipient_name,
      max(company_name) as company_name,
      count(*)::int as sends_count,
      count(distinct user_id)::int as unique_senders,
      max(created_at) as last_send_at,
      array_agg(id order by created_at desc) as send_ids
    from public.mail_sends
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
      (select count(*)::int from public.mail_sends) as mails_sent,
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
-- 3. mail_overview_stats
--
-- Aggregates everything the insights overview needs over the last p_days
-- window: top recipients, top links, mail-type breakdown, an hour-of-week
-- click heatmap (real + bot), and totals. The heatmap is returned as a flat
-- list of {dow, hour, real, bot} cells (dow: Monday=0..Sunday=6, hour 0..23,
-- both derived in UTC to match the previous server-local-on-Vercel behaviour);
-- the route reshapes it into the 7x24 grid the UI expects.
--
-- Keys mirror the previous JS:
--   recipient key  = lower(trim(name)) :: lower(trim(company))
--   link group key = 'key:' || link_key  when link_key is non-empty
--                    'url:' || original_url  otherwise
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
