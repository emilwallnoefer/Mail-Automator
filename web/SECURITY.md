# Security Masterplan — Mail Automator (`web/`)

_Last updated: 2026-07-26. Owner: admin. This document is the running plan for hardening the web app; update it as items ship._

> **Run-3 (2026-07-26)** added Tier 0 items **T0.6–T0.9** and Tier 1 items **T1.9–T1.11** from a
> third audit pass weighted to Postgres function privileges — the area runs 1 and 2 never
> examined. All run-3 findings are fixed on `worktree-security-audit-run3`; three migrations
> must be applied by hand. Artifacts: `docs/security-audit/run-3/`. The plain-language
> write-up of the whole posture is `docs/security-posture.md` (repo root).

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

**T0.6 — SECURITY DEFINER RPCs never revoked from `PUBLIC`, and unauthorized by user** _(HIGH, run-3 F1/F2)_
- **What:** `tt_refresh_overtime_bank_stats(uuid, date)` is `security definer`, takes `p_user` and never compares it to `auth.uid()`, and its `grant execute ... to authenticated` was never paired with `revoke all on function ... from public`. Postgres default-grants `EXECUTE TO PUBLIC` on `CREATE FUNCTION` and `CREATE OR REPLACE` preserves the ACL, so `anon` held EXECUTE across all five definitions. `tt_resolve_audit_user_id(text, jsonb, jsonb)` has the same defect (no grant *or* revoke at all). Every other RPC in the schema *does* revoke — that asymmetry was the tell.
- **Impact:** anyone with the public anon key reads any employee's overtime balance (and writes their stats row); the second function maps sequential `day_log_id`s to employee uuids. Defeats the RLS boundary the time-tracker schema rests on. Target uuids come free from `chat_messages.sender_id` (`using (true)`, intentional).
- **Fix:** `supabase/2026-07-26-rpc-privilege-hardening.sql` — revoke from `public`, re-grant `authenticated` on the first only, add `if auth.uid() is not null and auth.uid() <> p_user then raise ... 42501`, and reorder `search_path` to `pg_catalog, public, pg_temp`. The null-uid clause is required: the statement triggers and all service-role paths call it with no JWT context.
- **Effort:** S. **Applied by hand?** ⚠️ yes, required.

**T0.7 — Unauthenticated open redirect at `/auth/callback?next=`** _(MEDIUM, run-3 F3)_
- **What:** `next` fed straight into `NextResponse.redirect(new URL(next, origin))`. Resolving against a base does not constrain the target — an absolute or protocol-relative value discards the base. Route is not in the proxy matcher and needs no `code`, so it is reachable unauthenticated.
- **Impact:** phishing links carrying our own trusted origin. No token leak (the OAuth code is consumed server-side, not forwarded).
- **Fix:** `src/lib/safe-redirect.ts` (`safeRedirectPath`) — rooted single-`/` paths only; rejects absolute, `//host`, backslash variants and control chars. Colocated test; verified live.
- **Effort:** XS.

**T0.8 — Client-writable derived overtime cache** _(MEDIUM, run-3 F4)_
- **What:** `time_tracker_user_stats` granted `authenticated` table-wide `insert, update` with own-row policies but no column restriction or value check. `overtime_bank_mins` is derived, and `tt_admin_overview` reports it verbatim to Admin → Team time.
- **Impact:** a user sets their own reported overtime balance to any value; it survives until they next edit a day.
- **Fix:** `supabase/2026-07-26-user-stats-integrity.sql` revokes `insert, update`, keeps `select`; the client-side upsert in `time-tracker-queries.ts` now computes for display only. Own-row policies deliberately left in place. 
- **Effort:** S. **Applied by hand?** ⚠️ yes, required.

**T0.9 — `markdownToHtml` emitted raw source HTML; `html_body` unsanitized** _(MEDIUM, run-3 F5/F6)_
- **What:** T0.4 fixed the URL interpolation but left the escaping pass, which split on `/(<[^>]+>)/` and passed through anything tag-shaped — it cannot distinguish tags it generated from tags in the source. Confirmed by execution: `<script>`, `<style>`, `<a>`, `<img onerror>` all survived. Separately `html_body` was the only create-draft field bypassing sanitization.
- **Impact:** **not XSS** — `html_body` has no in-app render sink and the author is authenticated. It is a broken escaping control and falsifies the "the model never emits or formats links" guarantee in `mail-brief-llm.ts`, since Brief-mode prose is LLM-written from briefs that carry pasted customer text.
- **Fix:** placeholder-token approach — markdown constructs are swapped for `U+E000<n>U+E000` before the prose is escaped wholesale, then restored, so generated markup never passes through the escaper. Plus `sanitizeMailHtml` on `html_body` as an explicit second layer (a denylist, documented as such).
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

**T1.9 — Role read from `user_metadata` in the dashboard.** _(run-3 F7)_ `dashboard/page.tsx` was the last reader of the field T0.1 retired; it rendered the HR/admin tab for any self-assigned role (endpoints behind it still 403'd). Fixed to read `app_metadata`, matching `settings/page.tsx` and `admin-guard.ts`; stale docstring in `lib/user-role.ts` corrected. Effort: XS. **Done.**

**T1.10 — Cron route: mail-sending GET with no CSRF defence or rate limit.** _(run-3 F8)_ `SameSite=Lax` cookies ride cross-site top-level navigations, so one admin click fired `?send_test=<any address>` or a real `?force=1` blast. Added a per-IP limit (20/h) and a `Sec-Fetch-Site` check refusing *cross-site* invocation of any shape that can send — including the plain unforced call inside the real Monday 09:00 window. `preview`/`dry` stay open; admin-typed URLs (`Sec-Fetch-Site: none`) and Vercel Cron (no `Sec-Fetch-*` at all) are unaffected, so the runbook still works. Effort: S. **Done.**

**T1.11 — `chat-attachments` had no `allowed_mime_types`.** _(run-3 H4)_ Content-type is client-supplied (`chat.ts:328`). Bucket is private, signed-URL, and on a *different origin* from the app, so never app-session XSS — but it is script execution on the Supabase origin. `supabase/2026-07-26-chat-attachment-mime-allowlist.sql` sets a deliberately broad list excluding only browser-executable types (notably SVG). Effort: XS. **Applied by hand?** ⚠️ yes.

**T1.12 — `search_path` ordering on the remaining nine RPCs.** _(run-3 H5)_ They list `public` before `pg_catalog`, so a `public` object can shadow a built-in inside a definer function. Only exploitable if a client role holds `CREATE` on schema `public` — not determinable from the migration files. The two functions touched in run-3 were reordered; the rest are **open**. Check first: `select has_schema_privilege('anon','public','CREATE'), has_schema_privilege('authenticated','public','CREATE');`

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
- 2026-07-02 — **Tier 1 hardening applied** (lint + build + typecheck pass; security headers verified emitting via `next start` + curl):
  - **T1.1** — security headers in `next.config.ts` `headers()`: HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, and a CSP. The CSP ships **Report-Only** (`Content-Security-Policy-Report-Only`) so it can't break prod; set env `CSP_ENFORCE=1` to enforce after verifying no violations in staging (watch the browser console). `connect-src` is derived from `NEXT_PUBLIC_SUPABASE_URL` (REST + `wss` realtime).
  - **T1.3** — Gmail OAuth `state`: random value set as an HttpOnly cookie at `connect`, matched (and cleared) in `callback`. Closes finding #4.
  - **T1.4** — `CRON_SECRET` now compared with a constant-time SHA-256 `timingSafeEqual`.
  - **T1.5** — `updateSession` middleware now **fails closed** on error for `/dashboard`+`/settings` (redirects to `/login`) instead of `next()`.
  - **T1.6 / T1.7** — `supabase/2026-07-04-tier1-hardening.sql`: `force row level security` on `time_tracker_audit_log`; server-side 10 MiB `file_size_limit` on the `chat-attachments` bucket. **Apply by hand.**
  - **T1.8** — folded into T0.3 (auth now required on `/api/generate`, so the DDG outbound-fetch is no longer anonymous).
  - **T1.2 — still open** (durable rate limiting): needs an external store (Upstash / Vercel KV) or the Vercel edge firewall — an infra decision, not shipped here. The IP-source fix (T0.3) already removed the spoofable-key bypass.
  - **RLS testing** added: `web/scripts/rls-smoke.mjs` (`npm run test:rls`) signs in two ordinary users via the anon key and asserts cross-user read isolation, that `app_metadata.role` is not user-settable (T0.1), that a spoofed chat `sender_email` is stamped from the JWT (T0.5), and that service-role-only tables are unreadable. Needs `RLS_TEST_A_/RLS_TEST_B_` creds in the env; run against staging.
- 2026-07-26 — **Audit run-3 completed** (3-agent recon fleet weighted to the areas runs 1–2 never examined: Postgres function privileges, the auth callback, the outbound-HTML builder after its T0.4 fix, cron CSRF, role-read consistency). Artifacts in `docs/security-audit/run-3/`; posture write-up at `docs/security-posture.md`.
  - Re-verified **all** run-1/run-2 fixes against source rather than trusting this log — T0.1–T0.5 and T1.1/T1.3–T1.7 all hold.
  - **8 new findings, all fixed in this branch:** T0.6 (HIGH, definer RPC privilege escalation), T0.7 (open redirect), T0.8 (forgeable overtime cache), T0.9 (HTML escaper + `html_body`), T1.9 (role read), T1.10 (cron CSRF/rate limit), T1.11 (attachment MIME), plus H-notes.
  - **⚠️ Apply these three migrations by hand, BEFORE deploying the code:** `supabase/2026-07-26-rpc-privilege-hardening.sql`, `2026-07-26-user-stats-integrity.sql`, `2026-07-26-chat-attachment-mime-allowlist.sql`. The first two are load-bearing: the code no longer writes `time_tracker_user_stats` from the client, so without migration 2 the grant simply stays wider than it needs to be; without migration 1 the HIGH stays open. Deploy order: apply migrations → deploy code.
  - **Two lessons worth keeping.** (1) `rls-smoke.mjs` was structurally blind to T0.6 — it asserted cross-user *table* isolation and never called an RPC, but a `SECURITY DEFINER` function bypasses RLS by design. RPC probes added, plus a check that the stats cache is read-only to clients. (2) T0.9 shows a prior fix can be incomplete: run-2's T0.4 hardened one hole in `markdownBlockToHtml` and left a second, broader one in the same function.
  - **Verification:** 69 tests / 11 files pass; lint and build clean; `npm audit --omit=dev --audit-level=high` reports 0 (the 2 highs `npm audit` shows are dev-only). T0.7 and T1.10 confirmed fixed against a running `next start`; T0.9 confirmed broken-before/fixed-after by executing the escaper in isolation.
  - **Not verified:** T0.6/T0.7's premise rests on the live `proacl` of the two functions, read from migrations but never queried — the DB was unreachable from that session. The confirming `pg_proc` query is in the migration header; run it before and after applying.
  - **Still open:** T1.2 (durable rate limiting, needs an infra decision), T1.12 (`search_path` on nine RPCs), the CSP enforcement flag (`CSP_ENFORCE=1` in Vercel — the policy is currently Report-Only *and* has no report endpoint, so it is inert), HSTS preload submission, and the HR data-scope question (`guardTimeViewer` says "summaries" but `/api/admin/time-user` returns day-level sick leave and comp notes — deliberately left for a product decision).
