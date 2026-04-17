-- Fix "Database error deleting user" caused by tt_audit_row_change().
--
-- Postgres log showed:
--   ERROR: insert or update on table "time_tracker_audit_log" violates
--          foreign key constraint "time_tracker_audit_log_user_id_fkey"
--   DETAIL: Key (user_id)=(<uuid>) is not present in table "users".
--   CONTEXT: PL/pgSQL function tt_audit_row_change() line 24 at SQL statement
--   Command: DELETE FROM "users" AS users WHERE users.id = $1
--
-- Cause:
--   Deleting auth.users cascades to time_day_logs / time_day_breaks /
--   time_comp_adjustments. Their AFTER DELETE trigger tt_audit_row_change
--   INSERTs a row into time_tracker_audit_log referencing user_id. The FK
--   `user_id uuid references auth.users(id) on delete set null` does NOT help
--   here — ON DELETE SET NULL only rewrites existing rows when the parent
--   goes away. It cannot save a fresh INSERT that references an already-
--   deleted parent.
--
-- Fix:
--   Resolve the user, and if that user no longer exists in auth.users (because
--   this trigger fired during a cascade delete of the parent), write NULL.
--   The column is nullable, so the audit row is preserved for forensics.

create or replace function public.tt_audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_table text := TG_TABLE_NAME;
  v_op text := TG_OP;
  v_row_id bigint;
  v_user_id uuid;
  v_old jsonb := null;
  v_new jsonb := null;
begin
  if TG_OP = 'INSERT' then
    v_new := to_jsonb(NEW);
    v_row_id := NEW.id;
  elsif TG_OP = 'UPDATE' then
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_row_id := NEW.id;
  elsif TG_OP = 'DELETE' then
    v_old := to_jsonb(OLD);
    v_row_id := OLD.id;
  end if;

  v_user_id := public.tt_resolve_audit_user_id(v_table, v_new, v_old);

  -- If the resolved user has already been deleted from auth.users (e.g. this
  -- trigger is running inside a cascade delete of the auth.users row), the
  -- FK insert below would fail. Null it out so the audit row still lands.
  if v_user_id is not null
     and not exists (select 1 from auth.users where id = v_user_id) then
    v_user_id := null;
  end if;

  insert into public.time_tracker_audit_log (
    user_id,
    table_name,
    operation,
    row_id,
    old_row,
    new_row
  )
  values (
    v_user_id,
    v_table,
    v_op,
    v_row_id,
    v_old,
    v_new
  );

  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;
