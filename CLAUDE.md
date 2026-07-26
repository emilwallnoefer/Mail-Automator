# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

Two distinct subsystems live side-by-side:

1. **`web/`** — a Next.js 16 (App Router) + Supabase + Tailwind 4 dashboard. This is where almost all active development happens. It contains the Time Tracker, Mail Tracking, Admin module, Team Chat, Settings, Onboarding, and the Gmail draft-creation API used at runtime.
2. **`archive/mail-cli/`** — the retired Python `/mail` Cursor workflow, kept for reference only. Nothing imports or runs it; see `archive/mail-cli/README.md`. Its `training-links.json` carries two keys the web copy lacks, but both courses are offered by the web app via `industry-training-links.json` — a naming difference, nothing to port (closed 2026-07-26).

`Mail training cursor/` is local sample data and is git-ignored.

## Common commands

All `npm` commands run from `web/`.

```bash
# Dev server
cd web && npm run dev            # Next.js on http://localhost:3000

# Build / typecheck / lint
cd web && npm run build
cd web && npm run lint           # eslint (extends eslint-config-next)

# One-off data import
cd web && npm run import:hourlogger   # node scripts/import-hourlogger.mjs
```

Tests (run from `web/`): `npm run test` — Vitest unit suite (`src/**/*.test.ts`, colocated with sources); `npm run test:e2e` — Playwright smoke (`e2e/`, needs `.env.local` with the public Supabase vars and a one-time `npx playwright install chromium`); `npm run test:rls` — RLS smoke script. New pure-logic modules should get a colocated `*.test.ts`.

## Dependencies & CI

`.github/workflows/security-baseline.yml` is the only CI job. On every PR touching `web/**` it runs `npm ci`, `npm run lint`, then `npm audit --omit=dev --audit-level=high`. That last gate fails the **whole PR** on any high-severity advisory in a production dependency — including PRs that only touch markdown. A red check on an unrelated PR usually means the gate is failing on `main`, not that the PR broke something.

Two rules when touching `web/package.json`:

- **Regenerate the lockfile with npm 10**, not whatever npm you have locally: `npx -y npm@10 install --package-lock-only`. The runner's Node 22 ships npm 10, and the two majors resolve nested optional platform packages differently (`@img/sharp-wasm32` + `@rolldown/binding-wasm32-wasi` both want `@emnapi/*`, one via a range and one via an exact pin). A lock written by npm 11 installs fine on macOS and then fails `npm ci` on the runner with `Missing: @emnapi/core@… from lock file`. Validate before pushing with `npx -y npm@10 ci --dry-run` against a copy of `package.json` + `package-lock.json`.
- **Never delete `package-lock.json` to regenerate it.** That re-resolves every semver range at once; the last time it silently pulled newer eslint plugins whose React Compiler rules flagged 34 pre-existing violations across the components. Use `--package-lock-only` so unrelated packages keep the resolution they had.

Vulnerabilities that live *inside* `next` (it vendors a pinned `postcss` and an optional `sharp`) can't be fixed by bumping next alone — npm will propose an absurd downgrade. Pin them in the `overrides` block in `web/package.json` instead.

## Big-picture architecture (`web/`)

### Auth & roles

- Supabase handles auth; the SSR client lives in `src/lib/supabase/server.ts` and the browser client in `client.ts`. `src/proxy.ts` (Next 16's rename of middleware) refreshes the session cookie and gates `/dashboard`, `/settings`, `/login` via `lib/supabase/middleware.ts`. It is not the only guard — both gated pages re-check the session server-side and redirect, so a proxy bypass exposes nothing.
- `src/lib/supabase/admin.ts` is `"server-only"` and holds the **service-role** client. It bypasses RLS — only call it after a successful `guardAdmin()` / `guardTimeViewer()` check.
- Role resolution: `ADMIN_EMAILS` (env, comma-separated) → admin. Otherwise `user_metadata.role` ∈ {`sales`, `eu_pilot`, `us_pilot`, `hr`}. `hr` is admin-assigned only and gets read-only access to team-time endpoints via `guardTimeViewer()`. See `src/lib/admin-guard.ts` and `src/lib/user-role.ts`.
- All `/api/admin/*` routes must start with `guardAdmin()` or `guardTimeViewer()` before touching the service-role client. This is the single most important security invariant.

### Modules & where to look

- **Time Tracker** — UI in `components/time-tracker-panel.tsx`, week stepper in `week-stepper.tsx`. Server queries in `lib/time-tracker-queries.ts`, business rules in `lib/time-tracker-rules.ts`. API routes under `app/api/time-tracker/`. Schema lives in `supabase/time-tracker-schema.sql` + the dated migrations alongside it. Initial week is SSR'd (`dashboard/page.tsx`) to skip a first-paint fetch.
- **Mail Tracking** — admin-only; module in `components/mail-tracking/` (panel + `tabs/` + `charts/`), with `components/mail-tracking-panel.tsx` as a re-export shim. Mounted lazily by `admin-panel.tsx` under the "Mail tracking" section. Server engine in `lib/mail-engine.ts`. Public redirector at `app/r/[id]/` records clicks. Migrations: `supabase/2026-05-06-mail-link-tracking*.sql`, `2026-05-12-mail-click-timeline.sql`. All read paths **exclude `mail_sends.mail_type = 'pre'`**: pre-training mails render no link blocks, so they can never be clicked and would only dilute the click rates. The filter lives in the RPCs (`supabase/2026-07-26-mail-tracking-exclude-pre.sql`) — carry it forward when re-creating any of them.
- **Gmail integration** — OAuth flow under `app/api/gmail/{connect,callback,disconnect,status}/`, draft creation at `app/api/gmail/create-draft/`. Token storage/refresh logic in `lib/gmail.ts`. AI draft generation: `app/api/generate/route.ts`.
- **Admin** — `components/admin-panel.tsx` owns the section switcher (Overview, Time, Onboarding, Mail tracking, Users & roles, Reminders, Mail & AI, Audit log, Security) and delegates to one component per section: `admin-overview-stats.tsx` (usage insights), `admin-onboarding-panel.tsx`, `admin-reminder-controls.tsx`, `admin-mail-settings.tsx` (Brief-mode model), `admin-audit-log.tsx`, `admin-security-events.tsx`. Endpoints in `app/api/admin/`.
- **Team Chat** — `components/chat-widget.tsx`, server logic in `lib/chat.ts`, `app/api/chat/`. Uses Supabase Realtime (`postgres_changes` on `chat_messages` + `chat_message_votes`) and the private `chat-attachments` Storage bucket. Migrations: `supabase/2026-04-19-team-chat*.sql`.
- **Weekly reminder cron** — `app/api/cron/time-log-reminder/route.ts`. Triggered by Vercel Cron (see `web/vercel.json`) at 07:00 + 08:00 UTC every Monday; the route gates internally to "Monday 09:00 Europe/Zurich" so exactly one of the two runs work year-round across DST. Sends via Resend; audit rows in `time_log_reminder_sends`. Auth: `Authorization: Bearer ${CRON_SECRET}` from Vercel, or an admin session for manual invocations. Useful query params: `?preview=html|text`, `?send_test=<email>`, `?dry=1&force=1`, `?force=1`.

### Supabase migrations

`web/supabase/` is a **flat** directory of `.sql` files, mostly dated (`YYYY-MM-DD-...sql`). They are not orchestrated by the Supabase CLI in this repo — apply them in order by hand against the project. When adding schema changes, write a new dated file; do not edit historical ones. RLS policies are part of the migrations; the service-role key is the only way to bypass them and is gated as described above.

## Environment

Required env (dev: a gitignored dotenv in `web/` — this checkout uses `web/.env`, and Next loads `.env` and `.env.local` alike, so check which one exists before telling anyone a var is missing; prod: the hosting platform):

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public.
- `SUPABASE_SERVICE_ROLE_KEY` — server-only; bypasses RLS. Referenced only from `lib/supabase/admin.ts`.
- `ADMIN_EMAILS` — comma-separated; case-insensitive.
- `ANTHROPIC_API_KEY` — server-only; used by mail **Brief mode** (`/api/generate-brief` → `lib/mail-brief-llm.ts`) to have Claude write an email from a free-text brief. Referenced only from `lib/mail-brief-llm.ts` (`"server-only"`). If unset, Brief mode errors; the structured `/api/generate` path is unaffected. The Brief-mode model is chosen by admins in the dashboard (Admin → Mail & AI → "Mail brief model", `components/admin-mail-settings.tsx`), stored in `workspace_settings.mail_brief_model` and read by `/api/generate-brief`; optional env `MAIL_BRIEF_MODEL` is only a fallback, and the built-in default is `claude-opus-4-8` (allowlist in `lib/mail-brief-model.ts`).
- `RESEND_API_KEY`, `RESEND_FROM`, optional `RESEND_REPLY_TO` — reminder emails.
- `CRON_SECRET` — Vercel Cron bearer token. If unset, only admin sessions can hit cron routes.
- `GOOGLE_SHEETS_*` — travel-sheet integration for the Time Tracker (`lib/google-sheets.ts`).
- Optional `APP_BASE_URL` — overrides dashboard link embedded in reminder emails.

The `web/README.md` has the most detailed env-var reference and the cron/team-chat operational notes; treat it as the source of truth before this file.

## Conventions worth knowing

- `"server-only"` is used to keep admin/service code off the client bundle — preserve it when refactoring.
- Many UI panels are large client components (`"use client"`) that mount inside the SSR'd `dashboard/page.tsx`. Initial-data props from the server are deliberately prefetched to avoid a flash on first paint — keep that pattern when adding new modules.
- Mail templates and link policies used at runtime live in `web/src/mail-config/` (`training-email-templates.md`, `*.json`), consumed by `web/src/lib/mail-engine.ts` via `/api/generate`. Older copies under `archive/mail-cli/` belong to the retired Python CLI and are **not** read by the web app — edit the `web/src/mail-config/` ones.
- The retired `/mail` command's hard rule — never auto-send, never create a draft before an explicit `confirm draft` — still applies to any equivalent flow in this repo, including the web app's Gmail draft creation.

## Housekeeping (do this without being asked)

Handle these when they come up — right after a merge, or when a session notices the state is stale. Do not queue them up for the user to prompt. Every step has a verification that comes **first**; report what you verified alongside what you removed.

**After a PR you opened gets merged**

1. Fast-forward the primary checkout: `git pull --ff-only`. A squash merge always leaves it behind, and the next session then reads stale files.
2. Delete the branch locally and on `origin`. Squash merges mean the branch's own commits are absent from `main`, so `git branch -d` refuses and `git worktree`/`ExitWorktree` warn about "unmerged" commits — that warning is expected, not a reason to keep the branch. Confirm the content landed with `git diff --stat origin/main <branch>` (must print nothing), then use `-D`.
3. Remove the worktree you created (`ExitWorktree` with `action: "remove"`), gated on a clean `git status` plus the same empty diff.

**Orphaned worktree directories**

`.claude/worktrees/` accumulates leftovers from past sessions that `git worktree list` no longer knows about — their gitdir was pruned, so git can tell you *nothing* about them and "the branch is gone" proves nothing either. Each is typically 0.2–1.2 GB of `node_modules`. Prove a directory holds no unique work before deleting it, by hashing every source file and looking the hash up in the object database:

```bash
find "<dir>" -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.sql" -o -name "*.md" -o -name "*.json" -o -name "*.css" \) \
  -not -path "*/node_modules/*" -not -path "*/.next/*" -not -path "*/.git/*" |
  while IFS= read -r f; do h=$(git hash-object "$f"); git cat-file -e "$h" 2>/dev/null || echo "UNIQUE: $f"; done
```

Only `web/next-env.d.ts` (Next generates it) and `.claude/settings.local.json` (machine-local) are expected to come back unique. **Anything else means unpushed work — stop and ask.** Also check for a dotenv inside the directory before removing it; if the primary checkout has none, that copy may be the only one. `rm -rf` has no undo.

**Out of scope, always**

Never rewrite or delete anything on `main`/`origin/main`, never force-push, and leave `archive/` as the historical snapshot it is — differences from `web/src/mail-config/` there are expected and are not yours to reconcile.

## Release notes ("What's new" popup)

When you commit/merge/push a **user-facing** feature, add a `RELEASE_NOTES` entry in the same change (`web/src/lib/release-notes.ts`) — otherwise the dashboard "What's new" popup won't surface it. Prepend it to the array (the first element, `LATEST_RELEASE`, is what renders): `version` = today's `YYYY-MM-DD` (a new version is what re-fires the popup), a human `date`, a short `title`, and a few terse `highlights`. Skip only purely internal changes (refactors/CI/docs).
