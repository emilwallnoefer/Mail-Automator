# Security Audit — Mail Automator (`web/`) — run-1

**Date:** 2026-07-02
**Target:** `web/` (Next.js 16 App Router + Supabase + Vercel internal tool for Flyability)
**Method:** Cloudflare `security-audit` skill pipeline. Phase 1 recon + a single-operator hunt reading the security-critical code paths directly (the parallel hunting/validation sub-agents hit the session rate limit mid-run, so this is a **partial run**). Each reported finding's trace was read against source. **Re-run to improve coverage** — a single pass finds roughly half of what multiple passes do, and this pass weighted access-control, public endpoints, OAuth, and secrets.

## Executive summary

The app's core authorization invariant — every `/api/admin/*` route calls `guardAdmin()`/`guardTimeViewer()` before touching the service-role client — holds: every admin route checked enforces it, and `chat/mark-done` correctly gates a service-role write. Input is validated with zod + a shared sanitizer, and the public tracking redirect (`/r/[id]`) validates its target scheme and uses an opaque id. The weaknesses are concentrated in **where trust and secrets are stored**: roles and the Gmail refresh token both live in Supabase `user_metadata`, which the user can read and write from the browser. That turns one authorization check into a privilege-escalation and puts a long-lived Google token within reach of any client-side script. Separately, the paid LLM endpoint is unauthenticated behind a rate limit that keys on a spoofable header.

## Baseline

Comparable to internal ops tools built on Supabase + Vercel, plus mail trackers (Mailchimp/Customer.io) and LLM copy tools (Jasper/Copy.ai). Those accept an unauthenticated public tracking redirect and env-allowlist admin as reasonable tradeoffs — this app matches them there. Where it diverges from the baseline is storing authorization state and OAuth secrets in user-writable auth metadata; mature Supabase apps use `app_metadata` or a dedicated RLS-protected table for exactly this reason.

## Findings

| # | Severity | Title |
|---|----------|-------|
| 1 | **HIGH** | Privilege escalation to HR time-viewer via self-writable `user_metadata.role` |
| 2 | **MEDIUM** | Gmail refresh token stored in client-readable `user_metadata` |
| 3 | **MEDIUM** | Unauthenticated paid-LLM endpoint with a bypassable rate limit (denial-of-wallet) |
| 4 | **LOW** | Gmail OAuth callback missing `state` parameter (OAuth CSRF) |

### 1. Privilege escalation to HR time-viewer via self-writable `user_metadata.role` — HIGH
Roles are stored in `user_metadata` (`api/admin/users` PATCH, line 86) and `guardTimeViewer()` (`lib/admin-guard.ts:69`) trusts `user_metadata.role === 'hr'`. Supabase lets an authenticated user rewrite their own `user_metadata` with the anon key. Any non-admin runs `supabase.auth.updateUser({ data: { role: 'hr' } })` and then reads every employee's aggregated time and onboarding data via `/api/admin/time-overview`, `/api/admin/time-user`, `/api/admin/onboarding`.
**Fix:** store the role in `app_metadata` (service-role-write-only) or a `user_roles` table with RLS; read it there in `guardTimeViewer` and everywhere roles are read. Admin (`ADMIN_EMAILS`) is unaffected — this only escalates to the `hr` read scope.

### 2. Gmail refresh token stored in client-readable `user_metadata` — MEDIUM
`api/gmail/callback` (line 25/31) writes `tokens.refresh_token` into `user_metadata`; `api/gmail/create-draft` (line 108) reads it back. `user_metadata` rides in the user's JWT and is returned to the browser by `getUser()`, so the long-lived Gmail token (scopes `gmail.compose` + `spreadsheets.readonly`) is reachable by any client-side script. With no CSP (see hardening H1), any XSS or malicious dependency exfiltrates it for persistent, out-of-app mailbox access.
**Fix:** persist tokens in a server-only, RLS-forced table keyed by user id; never in `user_metadata`. Rotate tokens already stored there.

### 3. Unauthenticated paid-LLM endpoint with a bypassable rate limit — MEDIUM
`POST /api/generate-brief` is unauthenticated and calls Claude Opus per request. Its only guard is `checkRateLimit` keyed on `getClientIp()`, which reads the **left-most** `X-Forwarded-For` value (`lib/security/rate-limit.ts:31`) — attacker-controlled behind a proxy. Rotating a fake first IP defeats the 40/hour cap; the in-memory `Map` also doesn't persist across serverless instances. Result: an anonymous internet caller can burn the Anthropic budget at will (denial-of-wallet). `/api/generate` and `/api/render-brief` share the pattern (cheaper — deterministic).
**Fix:** require `getUser()` on the generation routes (at least `generate-brief`); derive the IP from a trusted platform header (`x-real-ip`/`x-vercel-forwarded-for`); back the limiter with a durable store or the edge firewall for any surface that must stay public.

### 4. Gmail OAuth callback missing `state` parameter (OAuth CSRF) — LOW
`getAuthUrl()` (`lib/gmail.ts:23`) omits `state` and the callback (`api/gmail/callback`) never validates one. An attacker can bind their own Google account to a logged-in victim's session via a crafted `/api/gmail/callback?code=…` link, silently redirecting the victim's future drafts into the attacker's mailbox.
**Fix:** random `state` set as an HttpOnly cookie at connect, verified in the callback.

## Hardening notes (defense-in-depth, not standalone findings)

- **H1 — No security headers.** `next.config.ts` sets none: no CSP, HSTS, X-Frame-Options, X-Content-Type-Options, or Referrer-Policy. A CSP in particular is the mitigating layer that would blunt finding #2. Add a `headers()` block.
- **H2 — Rate limiting is best-effort only.** In-memory (non-durable on serverless) and admin routes aren't rate-limited at all. Fine as a courtesy limit; not a security control (see #3).
- **H3 — Non-constant-time `CRON_SECRET` compare.** `authorize()` in the cron route uses `authHeader === \`Bearer ${cronSecret}\``. Use a constant-time comparison. Low, given network jitter.
- **H4 — Auth middleware fails open.** `updateSession` (`lib/supabase/middleware.ts`) catches all errors and returns `next()`, so a `getUser()` throw skips the `/dashboard` redirect. SSR page guards re-check, so it's defense-in-depth, but the fail-open direction is worth noting.

## What the codebase does well

- The `guardAdmin()`/`guardTimeViewer()` invariant is consistently applied on admin routes; `chat/mark-done` documents *why* it needs the service-role key and gates it behind a hard admin check.
- Admin identity is an env allowlist (`ADMIN_EMAILS`), independent of user-writable metadata — so finding #1 does **not** reach admin.
- Input is zod-validated and passed through a shared sanitizer that strips control chars and caps length; the tracking redirect validates the target scheme and marks links `noindex`/`no-referrer`.
- Inline-attachment and `contentId` inputs are tightly regex-constrained in `create-draft`.

## Coverage caveats

This is a partial run (agents rate-limited). Areas that warrant a dedicated follow-up pass: the mail-tracking admin query surface (`api/admin/mail-tracking/*`), team-chat storage/attachment handling (`lib/chat.ts`, `chat-attachments` bucket), the Google Sheets ingestion path (`lib/google-sheets.ts`), the RLS policies in `web/supabase/*.sql` (verify no table is missing forced RLS), and business-logic in the time-tracker write path. Re-run the audit to cover these.
