-- Tier 1 hardening (see web/SECURITY.md T1.6, T1.7). Apply by hand like the
-- other flat migrations.

-- T1.6 — `time_tracker_audit_log` enabled RLS but never forced it, unlike every
-- other table in the schema. Force it so the table-owning role is also subject
-- to RLS (defense-in-depth; the log is already trigger-populated and
-- client-immutable).
alter table public.time_tracker_audit_log force row level security;

-- T1.7 — enforce the chat-attachment size cap server-side. The 10 MiB limit was
-- previously only checked in the browser (src/lib/chat.ts), so a crafted client
-- could upload larger files. Set it at the bucket level. (Read access stays
-- team-wide by design — the shared channel intends every member to see the
-- attachments referenced by messages, which are themselves team-wide readable.)
update storage.buckets
  set file_size_limit = 10485760 -- 10 MiB, matches CHAT_ATTACHMENT_MAX_BYTES
  where id = 'chat-attachments';
