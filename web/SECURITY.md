# Security Masterplan — Mail Automator (`web/`)

_Last updated: 2026-07-02. Owner: admin. This document is the running plan for hardening the web app; update it as items ship._

## Context

This plan was produced from a deep security audit (Cloudflare `security-audit` skill pipeline; full artifacts in `~/security-audit-skill/mail-automator/run-1/`: `REPORT.md`, `FINDINGS-DETAIL` in `findings.json`) plus a paired feature request: **log the security events an admin needs to see, and email the admin on a likely breach.** The audit was a partial run (sub-agents hit a session rate limit) weighted toward access control, public endpoints, OAuth, and secrets — re-run it to widen coverage.

The core authorization invariant (`guardAdmin()`/`guardTimeViewer()` before any service-role use) holds. The real weaknesses are **where trust and secrets are stored** (Supabase `user_metadata`, which the browser can read and write) and an **unauthenticated paid-LLM endpoint**. Tier 2 adds the detection + alerting layer the app currently lacks entirely.

## Priority tiers

Each item: **what** · **impact** · **fix** · **effort**.

### Tier 0 — Fix now (confirmed, exploitable)

**T0.1 — Privilege escalation to `hr` via self-writable `user_metadata.role`** _(HIGH)_
- **What:** roles live in `user_metadata`; `guardTimeViewer()` (`src/lib/admin-guard.ts:69`) trusts `user_metadata.role === 'hr'`. Supabase lets a user rewrite their own `user_metadata` with the anon key, so any employee self-assigns `hr`.
- **Impact:** reads all employees' aggregated time + onboarding data (`/api/admin/time-overview`, `/api/admin/time-user`, `/api/admin/onboarding`). Does **not** reach admin (admin is `ADMIN_EMAILS`).
- **Fix:** move the role to `app_metadata` (service-role-write-only) or a `user_roles` table with RLS. Update the write in `src/app/api/admin/users/route.ts` (PATCH) and all reads (`admin-guard.ts`, `user-role.ts` consumers, `cron/time-log-reminder`). One-time backfill migration to copy existing roles.
- **Effort:** M (touches role read/write in ~4 files + a data backfill).

**T0.2 — Gmail refresh token in client-readable `user_metadata`** _(MEDIUM)_
- **What:** `api/gmail/callback` stores `refresh_token` in `user_metadata` (line 25/31); `create-draft` reads it (line 108). `user_metadata` is in the user's JWT, readable by client JS.
- **Impact:** any XSS/malicious dependency exfiltrates a long-lived Gmail token (`gmail.compose` + `spreadsheets.readonly`) for persistent out-of-app access. Amplified by no CSP (T1.1).
- **Fix:** new server-only `gmail_tokens` table (service-role, RLS forced, grants revoked) keyed by `user_id`; write/read there. Rotate tokens already in metadata.
- **Effort:** M (migration + callback/create-draft/status/disconnect updates).

**T0.3 — Unauthenticated paid-LLM endpoint, bypassable rate limit** _(MEDIUM)_
- **What:** `POST /api/generate-brief` is unauthenticated and calls Claude Opus. Its rate-limit key comes from the left-most `X-Forwarded-For` (`src/lib/security/rate-limit.ts:31`), which is client-spoofable behind a proxy; the limiter is also in-memory (non-durable on serverless).
- **Impact:** anonymous denial-of-wallet on the Anthropic budget. `generate` / `render-brief` share the pattern (cheaper).
- **Fix:** require `getUser()` on the generation routes; derive IP from a trusted platform header (`x-real-ip` / `x-vercel-forwarded-for`); back the limiter durably (or use the Vercel firewall) for anything left public.
- **Effort:** S–M.

### Tier 1 — Hardening (defense-in-depth)

**T1.1 — Security headers.** `next.config.ts` sets none. Add a `headers()` block: `Content-Security-Policy` (the mitigating layer for T0.2), `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`. Effort: S (CSP tuning is the only real work).

**T1.2 — Durable rate limiting + cover admin routes.** Replace the in-memory `Map` with a durable store (Upstash/Vercel KV) or edge firewall; add limits to admin routes. Effort: M.

**T1.3 — OAuth `state` (fixes finding #4).** Random `state` set as HttpOnly cookie at connect (`getAuthUrl` in `lib/gmail.ts`), verified in `api/gmail/callback`. Effort: S.

**T1.4 — Constant-time `CRON_SECRET` compare.** `authorize()` in `cron/time-log-reminder` uses `===`; use `crypto.timingSafeEqual`. Effort: XS.

**T1.5 — Middleware fail-closed.** `updateSession` catches all errors and returns `next()` (fail-open) for protected paths; prefer redirecting to `/login` on error for `/dashboard`+`/settings`. Effort: XS.

### Tier 2 — Detection & response (the second requested capability — build now)

The app records **no** security events and has **no** breach alerting. Extend the existing patterns rather than adding new infra.

**T2.1 — Security-event log.**
- Migration `web/supabase/2026-07-02-security-events.sql`: `public.security_events` (`id, kind, severity, actor_email, ip, user_agent, detail jsonb, created_at`), RLS forced + grants revoked — mirror `2026-07-01-admin-audit-log.sql`.
- `src/lib/security/security-events.ts`: `recordSecurityEvent()` — best-effort, never throws (mirror `recordAdminAudit()`). `SecurityEventKind`: `failed_admin_access`, `rate_limit_tripped`, `oauth_failure`, `suspicious_login` (extension point).
- Emit sites: `guardAdmin()`/`guardTimeViewer()` record `failed_admin_access` when a **logged-in non-admin** is rejected (401s from logged-out users are noise — skip them).

**T2.2 — Breach notification (reuses Resend).**
- `src/lib/security/breach-alert.ts`: `maybeAlertAdmins(event)` — when severity is high, or _N_ `failed_admin_access` from one actor within a window, email each `ADMIN_EMAILS` address via `sendEmailViaResend()`. Debounce (a `last_alerted_at`/state row) so one incident ≠ an email storm.
- Admin toggle `security_alerts_enabled` on `workspace_settings`, following the `reminder_paused`/`mail_brief_model` pattern; the toggle change is written to `admin_audit_log`.

**T2.3 — Admin UI.** Read-only `src/components/admin-security-events.tsx` (When/Kind/Severity/Actor/IP/Detail), read API `src/app/api/admin/security-events/route.ts` (`guardAdmin`, service-role, newest-first, limit 100), mounted as a new section in `admin-panel.tsx` beside "Audit log". Toggle surfaced near `admin-reminder-controls.tsx`.

**T2.4 — Release note** in `src/lib/release-notes.ts` (user-facing admin feature).

> Note: T2 is **detection**, not prevention — it tells the admin when someone is probing (e.g. attempting T0.1 escalation shows up as repeated `failed_admin_access`). It complements, and does not replace, the Tier 0 fixes.

## Suggested sequence

1. **T0.1** (highest impact, exploitable today).
2. **T2 detection + alerting** (this PR) — so probing/escalation attempts are visible while the rest is fixed.
3. **T0.2, T0.3**, then **T1.1** (CSR­P) which backstops T0.2.
4. Remaining Tier 1.
5. Re-run the audit for the coverage gaps listed in `REPORT.md` (mail-tracking admin queries, team-chat storage, Google Sheets ingestion, RLS policy sweep, time-tracker write logic).

## Status log

- 2026-07-02 — Audit run-1 completed; masterplan created; **T2 (detection + breach alerting) implemented** in this branch. Tier 0/1 items open.
