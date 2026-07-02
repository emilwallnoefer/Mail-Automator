-- Security event log + breach-alert state.
--
-- Records security-relevant events an admin needs to see — e.g. a logged-in
-- non-admin probing an admin route (`failed_admin_access`), OAuth failures,
-- rate-limit trips. This is the *detection* layer described in web/SECURITY.md
-- (Tier 2); it complements, and does not replace, the Tier 0 authorization
-- fixes.
--
-- Service-role only: written by the guards and read by the guardAdmin()-gated
-- /api/admin/security-events route, both via the service key. RLS is forced on
-- and grants are revoked from anon/authenticated (mirrors `admin_audit_log`
-- and `workspace_settings`).

create table if not exists public.security_events (
  id bigint generated always as identity primary key,
  kind text not null,
  severity text not null default 'warning',
  actor_email text,
  ip text,
  user_agent text,
  detail jsonb,
  created_at timestamptz not null default now()
);

-- Newest-first reads for the admin feed, plus a per-actor+time lookup used by
-- the breach-alert threshold check (count recent failures for one actor).
create index if not exists security_events_created_at_idx
  on public.security_events (created_at desc);
create index if not exists security_events_actor_kind_idx
  on public.security_events (actor_email, kind, created_at desc);

alter table public.security_events enable row level security;
alter table public.security_events force row level security;

revoke all on table public.security_events from anon;
revoke all on table public.security_events from authenticated;

-- Breach-alert admin controls + debounce state live on the singleton
-- workspace_settings row (see 2026-04-17-workspace-settings.sql).
--   security_alerts_enabled     — master on/off for breach emails (default on).
--   security_alert_threshold    — # of failed_admin_access from one actor within
--                                 the lookback window that triggers an alert.
--   security_alert_last_sent_at — debounce timestamp so one incident can't
--                                 produce an email storm.
alter table public.workspace_settings
  add column if not exists security_alerts_enabled boolean not null default true;
alter table public.workspace_settings
  add column if not exists security_alert_threshold integer not null default 5;
alter table public.workspace_settings
  add column if not exists security_alert_last_sent_at timestamptz;
