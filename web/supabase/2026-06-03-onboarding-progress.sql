-- Onboarding progress: server-side persistence of each user's pilot-onboarding
-- completion state.
--
-- Until now progress lived only in the browser's localStorage (keyed by email),
-- so it was invisible to admins and lost across devices. This table mirrors that
-- store server-side: one row per user holding a `progress` JSON map of
-- { onboardingItemId -> percent (0..100) }. The web app upserts the whole map on
-- change; admins read everyone's rows (via the service-role client, gated by
-- guardTimeViewer) to render the Onboarding overview tab.
--
-- Run once in the Supabase SQL Editor.

create table if not exists public.onboarding_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  -- { itemId: percent } where percent is an integer 0..100.
  progress jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.onboarding_progress enable row level security;
alter table public.onboarding_progress force row level security;

revoke all on table public.onboarding_progress from anon;
revoke all on table public.onboarding_progress from authenticated;
grant select, insert, update on table public.onboarding_progress to authenticated;

-- A user can only see and write their own row. Admin/HR reads happen through the
-- service-role client (which bypasses RLS) after guardTimeViewer().
drop policy if exists "onboarding_progress_select_own" on public.onboarding_progress;
create policy "onboarding_progress_select_own"
  on public.onboarding_progress for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "onboarding_progress_insert_own" on public.onboarding_progress;
create policy "onboarding_progress_insert_own"
  on public.onboarding_progress for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "onboarding_progress_update_own" on public.onboarding_progress;
create policy "onboarding_progress_update_own"
  on public.onboarding_progress for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
