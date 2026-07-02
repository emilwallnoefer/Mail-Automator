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

**T0.4 — HTML injection into Brief-mode emails via unescaped markdown URLs** _(MEDIUM, run-2 #5)_
- **What:** `markdownBlockToHtml` (`src/lib/mail-engine.ts:231-234`, `239-241`) interpolates link/image URLs into `href`/`src` without HTML-escaping (capture `[^)]+`, so a `"` breaks out), and runs over model-authored prose from the unauthenticated `/api/generate-brief` brief (`renderBriefMail`, `mail-engine.ts:717`).
- **Impact:** a crafted brief yields attacker-chosen links, remote images (tracking pixels), or broken-out HTML in the outgoing customer email — defeating the "links are never model-authored" tracking guarantee. Executable XSS is blunted by email-client sanitizers; no in-app `dangerouslySetInnerHTML` sink for `html_body`.
- **Fix:** HTML-escape + scheme-validate the URL (allow `https:`/`cid:` only), forbid quotes/whitespace in the capture, or strip markdown links/images from model prose (the plain-text path already does via `stripMarkdownLinks`).
- **Effort:** S.

**T0.5 — Team-chat message identity spoofing via unconstrained INSERT** _(MEDIUM, run-2 #6)_
- **What:** `chat_messages` grants `authenticated` a table-wide INSERT (`supabase/2026-04-19-team-chat.sql:39`) and the insert policy checks only `auth.uid() = sender_id` (`:48-51`). `sender_email` (free-text, drives the displayed identity) and the moderation fields `done_at`/`done_by`/`kind` are attacker-settable at insert.
- **Impact:** impersonation of any colleague/admin in the shared team channel (social-engineering/fraud vector) + forgeable moderation metadata. Bounded to the one channel; no data disclosure.
- **Fix:** BEFORE INSERT trigger stamping `sender_email` from `auth.jwt()->>'email'` and nulling `done_at`/`done_by`; or a column-scoped insert grant. New dated migration.
- **Effort:** S.

### Tier 1 — Hardening (defense-in-depth)

**T1.1 — Security headers.** `next.config.ts` sets none. Add a `headers()` block: `Content-Security-Policy` (the mitigating layer for T0.2), `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`. Effort: S (CSP tuning is the only real work).

**T1.2 — Durable rate limiting + cover admin routes.** Replace the in-memory `Map` with a durable store (Upstash/Vercel KV) or edge firewall; add limits to admin routes. Effort: M.

**T1.3 — OAuth `state` (fixes finding #4).** Random `state` set as HttpOnly cookie at connect (`getAuthUrl` in `lib/gmail.ts`), verified in `api/gmail/callback`. Effort: S.

**T1.4 — Constant-time `CRON_SECRET` compare.** `authorize()` in `cron/time-log-reminder` uses `===`; use `crypto.timingSafeEqual`. Effort: XS.

**T1.5 — Middleware fail-closed.** `updateSession` catches all errors and returns `next()` (fail-open) for protected paths; prefer redirecting to `/login` on error for `/dashboard`+`/settings`. Effort: XS.

**T1.6 — `time_tracker_audit_log` missing `force row level security`** (`supabase/time-tracker-durability.sql:24`) — the only one of 16 tables without `force`. Add it for consistency. Effort: XS. _(run-2 H5)_

**T1.7 — Tighten `chat-attachments` Storage.** Read policy is bucket-wide for all authenticated (`team-chat.sql:76-80`) and the 10 MiB cap is client-only (`chat.ts:309-313`). Scope reads and add a bucket-level size limit. Low impact (message rows are already team-wide readable). Effort: S. _(run-2 H6)_

**T1.8 — Unauthenticated outbound fetch on `/api/generate`.** Anonymous callers drive DuckDuckGo fetches via `enrichWithAutoResearch` (`company-research.ts:57`); fixed host so not SSRF, but compute amplification. Folds into T0.3's "require auth on generation routes." _(run-2 H7)_

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
- 2026-07-02 — **Audit run-2 completed** (full recon fleet over the run-1 gap areas: mail-tracking, chat + Storage, Sheets, time-tracker, settings, RLS sweep). Added T0.4/T0.5 (both MEDIUM integrity) and T1.6–T1.8. Confirmed clean: mail-tracking routes (no injection/IDOR), RLS across all 16 tables, time-tracker writes, account/delete, settings, Sheets fixed-spreadsheet, company-research (not SSRF). Artifacts in `docs/security-audit/run-2/`.
- 2026-07-02 — **All five Tier 0 fixes applied** (code changes in this branch; lint + build + typecheck pass):
  - **T0.1** — role moved to `app_metadata` (service-role-write-only); guard + admin PATCH + insights/time-overview/onboarding/cron routes + settings page now read it there.
  - **T0.2** — Gmail refresh token moved to a service-role `gmail_tokens` table via new `lib/gmail-tokens.ts`; callback/create-draft/status/disconnect + the time-tracker Sheets read rewired.
  - **T0.3** — `getUser()` gate added to `generate`, `generate-brief`, `render-brief`; rate-limit IP now taken from trusted `x-real-ip`/`x-vercel-forwarded-for`.
  - **T0.4** — markdown link/image URLs HTML-escaped + scheme-allowlisted in `markdownBlockToHtml`.
  - **T0.5** — BEFORE INSERT trigger stamps `chat_messages.sender_email` from the JWT and nulls `done_at`/`done_by`.
  - **⚠️ Apply these three migrations by hand** (flat, un-orchestrated): `supabase/2026-07-03-role-in-app-metadata.sql`, `2026-07-03-gmail-tokens.sql`, `2026-07-03-chat-insert-hardening.sql`. Each backfills so connected users keep working; the code reads the new locations, so **the app must not be deployed ahead of applying the migrations** (roles/Gmail would read empty until backfilled). Deploy order: apply migrations → deploy code.
  - Remaining open: Tier 1 hardening (T1.1–T1.8).
