-- Team Chat: the "Change" request kind is replaced by "Certificate".
--
-- A certificate request is a structured form (customer account, participants,
-- training date, programme, trainer, location) submitted from the chat
-- composer; `/api/chat/certificate-request` renders it into the message body
-- and mails the admins. See `web/src/lib/certificate-request.ts`.
--
-- `change_request` stays in the check constraint on purpose: the composer can
-- no longer produce it, but the change requests already in the history must
-- keep passing the constraint (and keep rendering their badge). Dropping the
-- value would break every UPDATE touching those rows.
--
-- Apply by hand in the Supabase SQL Editor like the other migrations. Run
-- after `2026-04-19-team-chat-marks-and-votes.sql`.

alter table public.chat_messages
  drop constraint if exists chat_messages_kind_check;

alter table public.chat_messages
  add constraint chat_messages_kind_check
  check (kind in ('message', 'feature_request', 'change_request', 'best_practice', 'certificate_request'));
