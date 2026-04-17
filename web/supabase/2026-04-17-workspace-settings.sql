-- Workspace-wide settings configurable by admins from the dashboard.
--
-- Singleton pattern: exactly one row, id = 1. We model it this way (instead
-- of a key/value table) because every setting is read on the critical path
-- of the Monday reminder cron — a typed single-row table is cheaper to
-- query and keeps the admin API strongly typed end-to-end.
--
-- Today this only holds the reminder pause switch. Add more columns here
-- (e.g. weekly target, allowed email domains, default role) as the
-- settings surface grows; never change `id = 1` or drop the check constraint.
--
-- Service-role only — no RLS policies needed, grants revoked from
-- anon/authenticated since the admin-guarded API routes read/write this
-- via the service key.

create table if not exists public.workspace_settings (
  id smallint primary key default 1,
  reminder_paused boolean not null default false,
  reminder_paused_at timestamptz,
  reminder_paused_by text,
  updated_at timestamptz not null default now(),
  constraint workspace_settings_singleton check (id = 1)
);

insert into public.workspace_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.workspace_settings enable row level security;
alter table public.workspace_settings force row level security;

revoke all on table public.workspace_settings from anon;
revoke all on table public.workspace_settings from authenticated;
