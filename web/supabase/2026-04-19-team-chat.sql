-- Team Chat: a single global team-wide channel.
--
-- Any signed-in user can read every message and send their own. There is
-- intentionally no edit / delete (v1) — keeps the surface small and audit-
-- friendly. Attachments live in the `chat-attachments` Storage bucket and
-- are referenced by `attachment_path` on the message row.
--
-- Realtime: we publish row-level inserts on `chat_messages` so connected
-- clients receive new messages without polling. Presence and "typing…"
-- signals are handled in-memory by Supabase Realtime channels and do NOT
-- require any tables.
--
-- Run once in the Supabase SQL Editor.

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users (id) on delete cascade,
  sender_email text not null,
  body text,
  attachment_path text,
  attachment_name text,
  attachment_type text,
  attachment_size integer check (attachment_size is null or attachment_size >= 0),
  created_at timestamptz not null default now(),
  -- A message must contain either text or an attachment (or both).
  constraint chat_messages_has_payload check (
    (body is not null and length(btrim(body)) > 0) or attachment_path is not null
  )
);

create index if not exists idx_chat_messages_created_at_desc
  on public.chat_messages (created_at desc);

alter table public.chat_messages enable row level security;
alter table public.chat_messages force row level security;

revoke all on table public.chat_messages from anon;
revoke all on table public.chat_messages from authenticated;
grant select, insert on table public.chat_messages to authenticated;

drop policy if exists "chat_messages_select_authed" on public.chat_messages;
create policy "chat_messages_select_authed"
  on public.chat_messages for select
  to authenticated
  using (true);

drop policy if exists "chat_messages_insert_own" on public.chat_messages;
create policy "chat_messages_insert_own"
  on public.chat_messages for insert
  to authenticated
  with check (auth.uid() = sender_id);

-- Add to the realtime publication so subscribed clients get INSERT events.
-- Wrapped in DO block because `add table` errors if it's already a member.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_messages'
  ) then
    execute 'alter publication supabase_realtime add table public.chat_messages';
  end if;
end
$$;

-- Storage bucket for chat attachments.
-- Private bucket: clients must request signed URLs via the Supabase JS
-- client (`storage.from('chat-attachments').createSignedUrl(...)`).
insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', false)
on conflict (id) do nothing;

drop policy if exists "chat_attachments_select_authed" on storage.objects;
create policy "chat_attachments_select_authed"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'chat-attachments');

drop policy if exists "chat_attachments_insert_own" on storage.objects;
create policy "chat_attachments_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'chat-attachments'
    and owner = auth.uid()
    -- Force every upload under a per-user folder so no one can overwrite
    -- another user's file. Path format: `<auth.uid()>/<random>-<filename>`.
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "chat_attachments_delete_own" on storage.objects;
create policy "chat_attachments_delete_own"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'chat-attachments' and owner = auth.uid());
