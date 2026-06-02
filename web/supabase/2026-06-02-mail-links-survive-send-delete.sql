-- Make deleting a mail_sends row NON-destructive to already-distributed
-- redirect links.
--
-- Bug it fixes: mail_send_links.send_id had `on delete cascade`, so
-- deleting a send from the Mail Tracking panel cascade-deleted its link
-- rows. Any /r/<id> link already sitting in a recipient's inbox then
-- resolved to nothing and bounced to "/". Deletion is meant to tidy the
-- dashboard, not break links that are already out in the world.
--
-- Fix: switch the FK to `on delete set null` and allow a null send_id.
-- After a send is deleted, its links become orphan rows (send_id null)
-- that the /r/<id> endpoint still resolves — recipients are unaffected —
-- while the send disappears from every panel view as before. The
-- mail_link_clicks -> mail_send_links cascade is left intact, so click
-- history follows the surviving link rows.
--
-- Run once in the Supabase SQL Editor.

alter table public.mail_send_links
  alter column send_id drop not null;

alter table public.mail_send_links
  drop constraint if exists mail_send_links_send_id_fkey;

alter table public.mail_send_links
  add constraint mail_send_links_send_id_fkey
  foreign key (send_id) references public.mail_sends (id) on delete set null;
c