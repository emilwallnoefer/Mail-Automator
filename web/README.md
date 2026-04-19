This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Environment variables

Key variables consumed by the app (set these in `.env.local` for local dev and in your hosting platform for production):

- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL (public).
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key (public).
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase **service role key**. Server-only; never expose to the client. Used exclusively by admin-only API routes (`/api/admin/*`) to list users and view everyone's time data.
- `ADMIN_EMAILS` — comma-separated list of emails granted the Admin module. Example: `ADMIN_EMAILS=you@flyability.com,ops@flyability.com`. Only users signed in with one of these emails see the Admin tab and can call `/api/admin/*`. Compared case-insensitively.
- Google Sheets variables (`GOOGLE_SHEETS_*`) — travel-sheet integration for the Time Tracker.
- `RESEND_API_KEY` — API key from [Resend](https://resend.com/api-keys). Used by the weekly "log your time" reminder email job.
- `RESEND_FROM` — verified sender identity used for reminder emails, e.g. `Time Tracker <noreply@flyability.com>`. The domain must be verified in Resend first.
- `RESEND_REPLY_TO` — optional `Reply-To` header for reminder emails (e.g. an HR mailbox).
- `CRON_SECRET` — any long random string. Vercel automatically sends it as `Authorization: Bearer <CRON_SECRET>` when it triggers Cron endpoints, and our reminder route rejects calls that don't match.
- `APP_BASE_URL` — optional. Overrides the dashboard link embedded in reminder emails. Defaults to the request origin.

Security note: the service role key bypasses Row-Level Security. It is only referenced from `src/lib/supabase/admin.ts`, which is marked `"server-only"` and is called solely after the `guardAdmin()` / `guardTimeViewer()` check in `src/lib/admin-guard.ts`.

### Roles

Roles are stored in Supabase `user_metadata.role`:

- `sales`, `eu_pilot`, `us_pilot` — self-selectable on first login.
- `hr` — read-only access to the **Team time** tab (aggregated weekly summaries + per-user week drill-down). HR cannot see or manage user roles. Not self-selectable; only an admin (email listed in `ADMIN_EMAILS`) can assign it via the Admin → Users &amp; roles tab.

The `hr` role re-uses the admin time endpoints (`/api/admin/time-overview` and `/api/admin/time-user`) via `guardTimeViewer()`. Role management (`/api/admin/users`) remains gated behind `guardAdmin()`.

### Weekly "log your time" reminder

A Vercel Cron Job hits `GET /api/cron/time-log-reminder` every Monday at 07:00 UTC **and** 08:00 UTC (configured in `vercel.json`). The route internally gates on "weekday = Monday AND hour = 9 in Europe/Zurich", so exactly one of the two invocations does work year-round — regardless of CET/CEST daylight-savings shifts.

For each user whose `user_metadata.role` is `sales`, `eu_pilot`, or `us_pilot`, the route sums `time_day_logs.net_mins` across the previous Monday→Sunday window. If the total is **0 minutes**, a reminder email is sent via [Resend](https://resend.com).

Useful knobs (all admin-gated unless called with the cron secret):

- **Preview the email in your browser:** `GET /api/cron/time-log-reminder?preview=html` renders the exact HTML recipients will see. Add `&name=Sarah` to override the greeting. `preview=text` returns the plain-text variant.
- **Send a test email to yourself:** `GET /api/cron/time-log-reminder?send_test=you@example.com` sends one real email to the given address via Resend, subject-prefixed with `[TEST]`. Does not touch the normal candidate list.
- **Dry run:** `GET /api/cron/time-log-reminder?dry=1&force=1` lists the candidates and what would be sent, without actually sending.
- **Send now regardless of time:** `GET /api/cron/time-log-reminder?force=1` (**actually sends** to every candidate — use carefully).
- **Vercel Cron auth:** When `CRON_SECRET` is set, Vercel sends it as `Authorization: Bearer <secret>` and the route trusts the call without requiring an admin session. If `CRON_SECRET` is missing, only admin-authed requests go through.

Tables involved:

- `time_day_logs` — summed via the service-role key to decide who gets reminded.
- `time_log_reminder_sends` — per-send audit log written by the cron route. One row is inserted for every outcome (`sent`, `failed`, `skipped_dry_run`), capturing the user, target week, Resend message id (or error), whether the call came from Vercel Cron or an admin session, and whether `force`/`dry` were used. See `supabase/2026-04-17-time-log-reminder-send-log.sql` for the schema; the table is RLS-locked and only the service-role key writes to it.

### Team Chat

A floating "Team chat" pill at the bottom-right of the dashboard opens a slide-in panel where every signed-in user can chat in a single global channel.

- **Schema (run in order):**
  1. `supabase/2026-04-19-team-chat.sql` — creates `public.chat_messages`, RLS policies, the realtime publication entry, and the private `chat-attachments` Storage bucket.
  2. `supabase/2026-04-19-team-chat-marks-and-votes.sql` — adds `kind` / `done_at` / `done_by` / `edited_at` columns, owner-only UPDATE/DELETE policies (column-level grant restricts authors to editing `body` only), the `chat_message_votes` table with its RLS, and sets `replica identity full` on both tables so Realtime delivers full UPDATE/DELETE rows.
- **Realtime requirement:** the dashboard subscribes to `postgres_changes` on both `chat_messages` and `chat_message_votes`, so Realtime must be enabled for the project (default on Supabase).
- **Attachments:** files (≤10 MB) are uploaded directly from the browser to the `chat-attachments` bucket under a per-user folder (`<user_id>/...`). Recipients fetch them via 1-hour signed URLs generated client-side with the user's JWT.
- **Presence + typing:** ephemeral, sent over Supabase Realtime presence/broadcast channels — no DB writes.
- **Message kinds & filters:** any message can be tagged on send as a `feature_request`, `change_request`, or `best_practice`. The widget exposes filter chips that, for the request kinds, hide entries that have been marked done.
- **Votes:** any signed-in user may upvote or downvote `feature_request` / `change_request` messages (one vote each, toggleable). `best_practice` messages do not have voting.
- **Marking done:** only admins (emails listed in `ADMIN_EMAILS`) see the "Mark done" button on feature/change requests. The flip happens via `POST /api/chat/mark-done`, which is `guardAdmin()`-protected and uses the service-role key to write `done_at` / `done_by`. RLS deliberately doesn't allow ordinary users to update those columns even on their own messages (column-level UPDATE grant restricts authors to `body` + `edited_at`).
- **Edit / delete:** authors can edit their own message's text or delete it entirely. Edits set `edited_at` and the row gets an "(edited)" tag; deletes are hard deletes (cascades through votes).
- **No new env vars.** Uses the existing `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` and (for `mark-done`) the existing `SUPABASE_SERVICE_ROLE_KEY` + `ADMIN_EMAILS`.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
