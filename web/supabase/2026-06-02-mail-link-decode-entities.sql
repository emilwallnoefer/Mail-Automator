-- Backfill: decode HTML entities that leaked into mail_send_links.original_url.
--
-- The link tracker used to store the raw `<a href>` value verbatim, so URLs
-- with query strings were persisted HTML-encoded (`?a=1&amp;b=2`). The
-- /r/<id> redirect then emitted that encoded string as its Location header,
-- turning `&amp;b=2` into a junk param named `amp;b`. The code fix
-- (link-tracker.ts now HTML-decodes before persisting) covers new sends;
-- this one-off corrects the rows already written.
--
-- Idempotent: re-running is a no-op once the entities are gone. Run once in
-- the Supabase SQL Editor after deploying the matching code change.

update public.mail_send_links
set original_url =
  replace(
  replace(
  replace(
  replace(
  replace(original_url, '&amp;', '&'),
                        '&#39;', '''') ,
                        '&quot;', '"'),
                        '&lt;', '<'),
                        '&gt;', '>')
where original_url ~ '&(amp|lt|gt|quot|#39);';
