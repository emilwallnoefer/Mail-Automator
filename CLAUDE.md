# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

Two distinct subsystems live side-by-side:

1. **`web/`** — a Next.js 16 (App Router) + Supabase + Tailwind 4 dashboard. This is where almost all active development happens. It contains the Time Tracker, Mail Tracking, Admin module, Team Chat, Settings, Onboarding, and the Gmail draft-creation API used at runtime.
2. **`archive/mail-cli/`** — the retired Python `/mail` Cursor workflow, kept for reference only. Nothing imports or runs it; see `archive/mail-cli/README.md` (it notes two course URLs that exist only in the archived config).

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

## Big-picture architecture (`web/`)

### Auth & roles

- Supabase handles auth; the SSR client lives in `src/lib/supabase/server.ts` and the browser client in `client.ts`. `middleware.ts` refreshes the session cookie on every request.
- `src/lib/supabase/admin.ts` is `"server-only"` and holds the **service-role** client. It bypasses RLS — only call it after a successful `guardAdmin()` / `guardTimeViewer()` check.
- Role resolution: `ADMIN_EMAILS` (env, comma-separated) → admin. Otherwise `user_metadata.role` ∈ {`sales`, `eu_pilot`, `us_pilot`, `hr`}. `hr` is admin-assigned only and gets read-only access to team-time endpoints via `guardTimeViewer()`. See `src/lib/admin-guard.ts` and `src/lib/user-role.ts`.
- All `/api/admin/*` routes must start with `guardAdmin()` or `guardTimeViewer()` before touching the service-role client. This is the single most important security invariant.

### Modules & where to look

- **Time Tracker** — UI in `components/time-tracker-panel.tsx`, week stepper in `week-stepper.tsx`. Server queries in `lib/time-tracker-queries.ts`, business rules in `lib/time-tracker-rules.ts`. API routes under `app/api/time-tracker/`. Schema lives in `supabase/time-tracker-schema.sql` + the dated migrations alongside it. Initial week is SSR'd (`dashboard/page.tsx`) to skip a first-paint fetch.
- **Mail Tracking** — `components/mail-tracking-panel.tsx`, admin variant in `admin-insights-panel.tsx`. Server engine in `lib/mail-engine.ts`. Public redirector at `app/r/[id]/` records clicks. Migrations: `supabase/2026-05-06-mail-link-tracking*.sql`, `2026-05-12-mail-click-timeline.sql`.
- **Gmail integration** — OAuth flow under `app/api/gmail/{connect,callback,disconnect,status}/`, draft creation at `app/api/gmail/create-draft/`. Token storage/refresh logic in `lib/gmail.ts`. AI draft generation: `app/api/generate/route.ts`.
- **Admin** — `components/admin-panel.tsx` (users & roles, workspace settings), `admin-insights-panel.tsx` (mail/usage insights). Endpoints in `app/api/admin/`.
- **Team Chat** — `components/chat-widget.tsx`, server logic in `lib/chat.ts`, `app/api/chat/`. Uses Supabase Realtime (`postgres_changes` on `chat_messages` + `chat_message_votes`) and the private `chat-attachments` Storage bucket. Migrations: `supabase/2026-04-19-team-chat*.sql`.
- **Weekly reminder cron** — `app/api/cron/time-log-reminder/route.ts`. Triggered by Vercel Cron (see `web/vercel.json`) at 07:00 + 08:00 UTC every Monday; the route gates internally to "Monday 09:00 Europe/Zurich" so exactly one of the two runs work year-round across DST. Sends via Resend; audit rows in `time_log_reminder_sends`. Auth: `Authorization: Bearer ${CRON_SECRET}` from Vercel, or an admin session for manual invocations. Useful query params: `?preview=html|text`, `?send_test=<email>`, `?dry=1&force=1`, `?force=1`.

### Supabase migrations

`web/supabase/` is a **flat** directory of `.sql` files, mostly dated (`YYYY-MM-DD-...sql`). They are not orchestrated by the Supabase CLI in this repo — apply them in order by hand against the project. When adding schema changes, write a new dated file; do not edit historical ones. RLS policies are part of the migrations; the service-role key is the only way to bypass them and is gated as described above.

## Environment

Required env (`web/.env.local` for dev, hosting platform for prod):

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public.
- `SUPABASE_SERVICE_ROLE_KEY` — server-only; bypasses RLS. Referenced only from `lib/supabase/admin.ts`.
- `ADMIN_EMAILS` — comma-separated; case-insensitive.
- `ANTHROPIC_API_KEY` — server-only; used by mail **Brief mode** (`/api/generate-brief` → `lib/mail-brief-llm.ts`) to have Claude write an email from a free-text brief. Referenced only from `lib/mail-brief-llm.ts` (`"server-only"`). If unset, Brief mode errors; the structured `/api/generate` path is unaffected. The Brief-mode model is chosen by admins in the dashboard (Admin → Insights → Controls), stored in `workspace_settings.mail_brief_model` and read by `/api/generate-brief`; optional env `MAIL_BRIEF_MODEL` is only a fallback, and the built-in default is `claude-opus-4-8` (allowlist in `lib/mail-brief-model.ts`).
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

## Release notes ("What's new" popup)

When you commit/merge/push a **user-facing** feature, add a `RELEASE_NOTES` entry in the same change (`web/src/lib/release-notes.ts`) — otherwise the dashboard "What's new" popup won't surface it. Prepend it to the array (the first element, `LATEST_RELEASE`, is what renders): `version` = today's `YYYY-MM-DD` (a new version is what re-fires the popup), a human `date`, a short `title`, and a few terse `highlights`. Skip only purely internal changes (refactors/CI/docs).
