-- Backfill: move each user's `role` from user_metadata (user-writable) to
-- app_metadata (service-role only). Fixes the hr self-escalation (see SECURITY.md T0.1).
-- Apply by hand against the Supabase project, like the other flat migrations.
update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('role', raw_user_meta_data->'role')
  where raw_user_meta_data ? 'role';
update auth.users
  set raw_user_meta_data = raw_user_meta_data - 'role'
  where raw_user_meta_data ? 'role';
