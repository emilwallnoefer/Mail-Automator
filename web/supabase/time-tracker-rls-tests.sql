-- Time Tracker RLS isolation checks
-- Run after time-tracker-schema.sql and time-tracker-durability.sql.
-- This script needs at least two users in auth.users.

do $$
declare
  user_a uuid;
  user_b uuid;
  probe_date date := date '2099-12-31';
  visible_count integer;
begin
  select id into user_a from auth.users order by created_at asc limit 1;
  select id into user_b from auth.users where id <> user_a order by created_at asc limit 1;

  if user_a is null or user_b is null then
    raise exception 'Need at least two auth users to run RLS tests.';
  end if;

  perform set_config('request.jwt.claim.role', 'authenticated', true);

  -- User A inserts a row.
  perform set_config('request.jwt.claim.sub', user_a::text, true);
  insert into public.time_day_logs (user_id, work_date, start_time, stop_time, net_mins, holiday, source)
  values (user_a, probe_date, '09:00', '17:00', 480, false, 'rls_test')
  on conflict (user_id, work_date)
  do update set net_mins = excluded.net_mins;

  -- User B must not see user A's row.
  perform set_config('request.jwt.claim.sub', user_b::text, true);
  select count(*) into visible_count
  from public.time_day_logs
  where user_id = user_a and work_date = probe_date;
  if visible_count <> 0 then
    raise exception 'RLS failure: user B can see user A day logs.';
  end if;

  -- User B must not be able to delete user A's row.
  delete from public.time_day_logs
  where user_id = user_a and work_date = probe_date;
  get diagnostics visible_count = row_count;
  if visible_count <> 0 then
    raise exception 'RLS failure: user B deleted user A day logs.';
  end if;

  -- User A inserts a comp adjustment and user B cannot read it.
  perform set_config('request.jwt.claim.sub', user_a::text, true);
  insert into public.time_comp_adjustments (user_id, work_date, mins, note, source)
  values (user_a, probe_date, 15, 'rls probe', 'rls_test')
  on conflict (user_id, work_date)
  do update set mins = excluded.mins;

  perform set_config('request.jwt.claim.sub', user_b::text, true);
  select count(*) into visible_count
  from public.time_comp_adjustments
  where user_id = user_a and work_date = probe_date;
  if visible_count <> 0 then
    raise exception 'RLS failure: user B can see user A comp adjustments.';
  end if;

  -- Reset to user A and clean up the probe row.
  perform set_config('request.jwt.claim.sub', user_a::text, true);
  delete from public.time_comp_adjustments where user_id = user_a and work_date = probe_date;
  delete from public.time_day_logs where user_id = user_a and work_date = probe_date;
  raise notice 'RLS isolation tests passed for time tracker tables.';
end $$;
