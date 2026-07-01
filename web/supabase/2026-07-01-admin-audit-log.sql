-- Admin action audit trail.
--
-- Records deliberate admin actions taken from the dashboard (role changes,
-- reminder pause/resume, mail-brief-model changes) so there is an accountable
-- history of "who changed what, when". This is distinct from
-- `time_tracker_audit_log`, which is a DB-trigger forensic log of row mutations
-- on the time-tracking tables — this one is application-level and intentional.
--
-- Service-role only: written and read exclusively through the guardAdmin()-gated
-- API routes via the service key, so RLS is forced on and grants are revoked
-- from anon/authenticated (mirrors `workspace_settings`).

create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_email text,
  action text not null,
  target text,
  detail jsonb,
  created_at timestamptz not null default now()
);

-- Newest-first reads are the only access pattern.
create index if not exists admin_audit_log_created_at_idx
  on public.admin_audit_log (created_at desc);

alter table public.admin_audit_log enable row level security;
alter table public.admin_audit_log force row level security;

revoke all on table public.admin_audit_log from anon;
revoke all on table public.admin_audit_log from authenticated;
