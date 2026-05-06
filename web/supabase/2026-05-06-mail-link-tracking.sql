-- Mail link click tracking.
--
-- Three tables back the per-recipient click tracker built into the mail
-- generator: a `mail_sends` row is written each time a Gmail draft is
-- created, every http(s) link in the draft's HTML body becomes a
-- `mail_send_links` row, and any hit on the `/r/<id>` redirect endpoint
-- writes a `mail_link_clicks` row before 302-ing to the original URL.
--
-- Reads are admin-only via the existing admin API surface (service role,
-- bypassing RLS). Writes also go through service role: the public
-- redirect endpoint must be reachable by recipients who are not signed
-- in, so RLS is enabled but no `authenticated`/`anon` policies are
-- granted. Tighten this later if we expose any of these to end users.
--
-- IP addresses are never stored raw — we hash them with `TRACKING_SALT`
-- in the redirect endpoint and persist only the hash so we can
-- de-duplicate likely scanner traffic without holding personal data.
--
-- Run once in the Supabase SQL Editor.

create table if not exists public.mail_sends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  recipient_name text not null,
  recipient_email text,
  company_name text,
  subject text not null,
  mail_type text not null,
  language text,
  template_variant text,
  training_type text,
  created_at timestamptz not null default now()
);

create index if not exists idx_mail_sends_user_created
  on public.mail_sends (user_id, created_at desc);

create index if not exists idx_mail_sends_created_at
  on public.mail_sends (created_at desc);

alter table public.mail_sends enable row level security;
alter table public.mail_sends force row level security;
revoke all on table public.mail_sends from anon;
revoke all on table public.mail_sends from authenticated;

create table if not exists public.mail_send_links (
  -- Short opaque id used in the public /r/<id> URL (generated server-side).
  id text primary key,
  send_id uuid not null references public.mail_sends (id) on delete cascade,
  original_url text not null,
  link_label text,
  link_key text,
  created_at timestamptz not null default now(),
  constraint mail_send_links_id_format check (id ~ '^[A-Za-z0-9_-]{8,32}$')
);

create index if not exists idx_mail_send_links_send
  on public.mail_send_links (send_id);

alter table public.mail_send_links enable row level security;
alter table public.mail_send_links force row level security;
revoke all on table public.mail_send_links from anon;
revoke all on table public.mail_send_links from authenticated;

create table if not exists public.mail_link_clicks (
  id uuid primary key default gen_random_uuid(),
  link_id text not null references public.mail_send_links (id) on delete cascade,
  clicked_at timestamptz not null default now(),
  ip_hash text,
  user_agent text,
  referer text,
  is_likely_bot boolean not null default false
);

create index if not exists idx_mail_link_clicks_link_clicked
  on public.mail_link_clicks (link_id, clicked_at desc);

create index if not exists idx_mail_link_clicks_clicked_at
  on public.mail_link_clicks (clicked_at desc);

alter table public.mail_link_clicks enable row level security;
alter table public.mail_link_clicks force row level security;
revoke all on table public.mail_link_clicks from anon;
revoke all on table public.mail_link_clicks from authenticated;
