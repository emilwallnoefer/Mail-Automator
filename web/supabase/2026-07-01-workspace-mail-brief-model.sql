-- Adds the Brief-mode model selector to the singleton workspace_settings row.
-- NULL means "fall back to MAIL_BRIEF_MODEL env / built-in default"
-- (claude-opus-4-8). Admins set this from the dashboard Insights → Controls.
--
-- Service-role only, like the rest of workspace_settings — no RLS policy
-- needed; the admin-guarded API reads/writes it via the service key.

alter table public.workspace_settings
  add column if not exists mail_brief_model text;
