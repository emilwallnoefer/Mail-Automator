-- Loosen the mail_send_links id format check so the link-tracker can
-- emit human-readable ids of the form `<slug>-<random>` (e.g.
-- `introductory-ut-training-deck-aB12cD3`). The original 8–32 char
-- limit was sized for the random-only format; existing rows still fit
-- the new range, so this is a non-destructive widening.
--
-- Run once in the Supabase SQL Editor after deploying the matching
-- code change. Skipping this migration will not break existing links,
-- but new sends will fail to insert because the slug-based id exceeds
-- 32 characters.

alter table public.mail_send_links
  drop constraint if exists mail_send_links_id_format;

alter table public.mail_send_links
  add constraint mail_send_links_id_format
  check (id ~ '^[A-Za-z0-9_-]{8,100}$');
