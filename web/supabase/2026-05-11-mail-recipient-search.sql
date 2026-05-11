-- Adds an all-time recipient search RPC for the Mail Tracking tab.
-- mirrors mail_recipient_week but drops the week filter in favour of a
-- case-insensitive substring match against recipient name, company name,
-- and recipient email. Result set is bounded by p_limit so the route
-- response stays small even with very large mail_sends tables.

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
    where lower(s.recipient_name) like q.pattern
       or lower(coalesce(s.company_name, '')) like q.pattern
       or lower(coalesce(s.recipient_email, '')) like q.pattern
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
