-- ---------------------------------------------------------------------------
-- Fleet holder claims — oversight columns
-- ---------------------------------------------------------------------------
--
-- Claiming a free-text holder name is deliberately PERMISSIVE. The material
-- was imported from a spreadsheet that spelled people inconsistently ("Emil",
-- "Emil Wallnofer", "Wataru", "APAC team"), so requiring the label to match the
-- claimant's account name would strand exactly the people the flow exists to
-- onboard. See `app/api/fleet/handlers/claim-holder.ts`.
--
-- The price of that looseness is oversight, and oversight needs two facts the
-- table never kept:
--
--   1. whether the label actually looked like the claimant at claim time; and
--   2. the label as a HUMAN typed it — `fleet_holder_aliases.label` is the
--      lower-cased, accent-folded normal form, so "Emil Wallnöfer" is stored as
--      "emil wallnofer" and the real spelling was lost.
--
-- With both recorded, Admin → Holder claims can show every claim, flag the ones
-- that did not match, and let an admin reassign or release the name.
--
-- Apply AFTER 2026-09-01-fleet-holder-claims.sql.

alter table public.fleet_holder_aliases
  -- Was the label a plausible match for the claimant at claim time
  -- (`holderLabelMatchesPerson` in lib/fleet-rules.ts)? Default true because
  -- every row written before this migration came from a path that only ever
  -- linked a person to their own name: the auto-link on sign-in and
  -- `register_member` both derive the label FROM the viewer.
  add column if not exists self_match boolean not null default true,
  -- The label exactly as it was typed / as it appeared in the sheet, before
  -- normalisation. Nullable: historical rows have no record of it.
  add column if not exists claimed_label text,
  -- Set when an admin corrects a claim from Admin → Holder claims, so the table
  -- can show "reassigned by X" rather than presenting a fixed row as an
  -- original claim.
  add column if not exists reassigned_by uuid references auth.users (id) on delete set null,
  add column if not exists reassigned_at timestamptz;

comment on column public.fleet_holder_aliases.self_match is
  'False when the claimed label did not look like the claimant. Recorded, never enforced — admins are emailed and can reassign.';
comment on column public.fleet_holder_aliases.claimed_label is
  'The holder label as typed, before normalisation. `label` is the normalised primary key.';

-- Admin → Holder claims sorts newest-first and highlights mismatches; both are
-- served from one small table, but the partial index keeps the mismatch lookup
-- cheap no matter how many aliases accumulate.
create index if not exists fleet_holder_aliases_mismatch_idx
  on public.fleet_holder_aliases (claimed_at desc)
  where not self_match;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
--
-- RLS and `force row level security` are already on from
-- 2026-09-01-fleet-holder-claims.sql; re-asserted here so this file is safe to
-- apply to a database where that one was edited.

alter table public.fleet_holder_aliases enable row level security;
alter table public.fleet_holder_aliases force row level security;

-- The 2026-09-01 file granted `select` to `authenticated` "so the UI can show
-- who claimed what". No client ever used it: every read of this table in the
-- app goes through the service-role client behind `/api/fleet` or the
-- guarded `/api/admin/fleet-holder-claims`. The columns added above are
-- oversight data — "this person's claim did not look like them" is an admin
-- judgement, not something to hand to every signed-in user — so the unused
-- grant is withdrawn rather than widened.
revoke all on table public.fleet_holder_aliases from anon, authenticated;

drop policy if exists "fleet_holder_aliases_select_all" on public.fleet_holder_aliases;
