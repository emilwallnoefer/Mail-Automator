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

Useful knobs:

- **Test manually (dry run, admin-authed):** `GET /api/cron/time-log-reminder?dry=1&force=1` — logged in as an admin in the browser lists the candidates and shows what would be sent, without actually sending.
- **Send now regardless of time:** `GET /api/cron/time-log-reminder?force=1` (admin-authed, **actually sends**).
- **Vercel Cron auth:** When `CRON_SECRET` is set, Vercel sends it as `Authorization: Bearer <secret>` and the route trusts the call without requiring an admin session. If `CRON_SECRET` is missing, only admin-authed requests go through.

Tables involved: `time_day_logs` (summed via service-role). No new tables were added.

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
