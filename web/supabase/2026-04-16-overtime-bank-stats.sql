-- Persisted overtime bank cache for fast Time Tracker loads.
-- Safe to run after the base time-tracker schema exists.

create table if not exists public.time_tracker_user_stats (
  user_id uuid primary key references auth.users (id) on delete cascade,
  overtime_bank_mins integer not null default 0,
  computed_for_day date not null default current_date,
  updated_at timestamptz not null default now()
);

create index if not exists idx_time_tracker_user_stats_computed_day
  on public.time_tracker_user_stats (computed_for_day);

alter table public.time_tracker_user_stats enable row level security;
alter table public.time_tracker_user_stats force row level security;

revoke all on table public.time_tracker_user_stats from anon;
revoke all on table public.time_tracker_user_stats from authenticated;
grant select, insert, update on table public.time_tracker_user_stats to authenticated;

drop policy if exists "time_tracker_user_stats_select_own" on public.time_tracker_user_stats;
create policy "time_tracker_user_stats_select_own"
  on public.time_tracker_user_stats for select
  using (auth.uid() = user_id);

drop policy if exists "time_tracker_user_stats_insert_own" on public.time_tracker_user_stats;
create policy "time_tracker_user_stats_insert_own"
  on public.time_tracker_user_stats for insert
  with check (auth.uid() = user_id);

drop policy if exists "time_tracker_user_stats_update_own" on public.time_tracker_user_stats;
create policy "time_tracker_user_stats_update_own"
  on public.time_tracker_user_stats for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.tt_refresh_overtime_bank_stats(
  p_user uuid,
  p_today date default current_date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer := 0;
begin
  select coalesce(
    sum(
      case
        when coalesce(logs.holiday, false) and coalesce(logs.net_mins, 0) = 0 then 0
        when (
          (extract(dow from dates.work_date)::int in (0, 6))
          and coalesce(logs.net_mins, 0) > 0
          and dates.work_date >= date '2026-04-01'
        )
          or (coalesce(logs.holiday, false) and coalesce(logs.net_mins, 0) > 0)
          then greatest(0, coalesce(logs.net_mins, 0)) - coalesce(comp.mins, 0)
        else greatest(0, coalesce(logs.net_mins, 0) - 504) - coalesce(comp.mins, 0)
      end
    ),
    0
  )
  into v_total
  from (
    select work_date
    from public.time_day_logs
    where user_id = p_user
    union
    select work_date
    from public.time_comp_adjustments
    where user_id = p_user
  ) dates
  left join public.time_day_logs logs
    on logs.user_id = p_user
   and logs.work_date = dates.work_date
  left join public.time_comp_adjustments comp
    on comp.user_id = p_user
   and comp.work_date = dates.work_date;

  insert into public.time_tracker_user_stats as stats (
    user_id,
    overtime_bank_mins,
    computed_for_day,
    updated_at
  )
  values (
    p_user,
    v_total,
    current_date,
    now()
  )
  on conflict (user_id) do update
    set overtime_bank_mins = excluded.overtime_bank_mins,
        computed_for_day = excluded.computed_for_day,
        updated_at = excluded.updated_at;

  return v_total;
end;
$$;

grant execute on function public.tt_refresh_overtime_bank_stats(uuid, date) to authenticated;

create or replace function public.tt_refresh_overtime_bank_stats_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  v_user := coalesce(new.user_id, old.user_id);

  if v_user is not null then
    perform public.tt_refresh_overtime_bank_stats(v_user, current_date);
  end if;

  return null;
end;
$$;

drop trigger if exists trg_tt_refresh_overtime_bank_stats_day_logs on public.time_day_logs;
create trigger trg_tt_refresh_overtime_bank_stats_day_logs
after insert or update or delete on public.time_day_logs
for each row execute function public.tt_refresh_overtime_bank_stats_trigger();

drop trigger if exists trg_tt_refresh_overtime_bank_stats_comp on public.time_comp_adjustments;
create trigger trg_tt_refresh_overtime_bank_stats_comp
after insert or update or delete on public.time_comp_adjustments
for each row execute function public.tt_refresh_overtime_bank_stats_trigger();

do $$
declare
  v_user uuid;
begin
  for v_user in
    select user_id from public.time_day_logs
    union
    select user_id from public.time_comp_adjustments
  loop
    perform public.tt_refresh_overtime_bank_stats(v_user, current_date);
  end loop;
end;
$$;
