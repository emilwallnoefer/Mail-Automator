# Security Audit — Mail Automator (`web/`) — run-3

**Date:** 2026-07-26
**Target:** `web/` at `main` (3cdb53d), audited on branch `worktree-security-audit-run3`
**Method:** `security-audit` skill pipeline. Read run-1 and run-2 `findings.json` first to skip
known issues and target the gaps they left. Phase 1 recon ran as a 3-agent parallel fleet
(route/auth coverage · SQL grants + RLS + injection · secrets/XSS/headers/deps); every finding
below was then re-verified by me directly against source, and the two that could be tested
locally were confirmed by execution rather than argument.

## Executive summary

**The five Tier-0 findings and all but one Tier-1 item from runs 1 and 2 are genuinely fixed** —
I re-verified each against source rather than trusting `SECURITY.md`'s status log. Roles live in
`app_metadata`, Gmail refresh tokens live in a service-role-only table, the generation routes
require a session, OAuth has a real `state` cookie, the cron secret is compared in constant time,
security headers ship, and the middleware fails closed.

This run went after ground the first two never touched. The most productive was **Postgres
function privileges**: neither prior run checked `EXECUTE` grants on `SECURITY DEFINER`
functions, and that is where the one HIGH lives. `tt_refresh_overtime_bank_stats` takes a
`user_id` argument it never compares to `auth.uid()`, runs with RLS bypassed, and — unlike every
other RPC in the schema — was never revoked from `PUBLIC`. Anyone holding the public anon key
can read any employee's overtime balance.

Two themes worth naming:

1. **The RLS smoke test asserted the wrong layer.** `scripts/rls-smoke.mjs` checked cross-user
   *table* isolation thoroughly and never called an RPC — but a definer function bypasses RLS by
   design, so table-level tests are structurally blind to F1/F2. Fixed in this run.
2. **A previous fix was incomplete.** run-2's T0.4 correctly hardened URL interpolation in
   `markdownToHtml` but left a second hole in the same function: the escaper emitted any
   tag-shaped text from the *source* verbatim (F5).

Everything found was fixed in this branch. Three migrations must be applied by hand.

## Baseline

Comparable to internal ops tools on Supabase + Vercel, plus mail trackers and LLM copy tools.
Those baselines accept an unauthenticated public click-redirect and env-allowlist admin — this
app matches. Where it now *exceeds* the baseline: forced RLS on all 17 tables, a security-event
log with breach alerting, and constant-time secret comparison are all above what comparable
internal tools ship. The `PUBLIC EXECUTE` default on `CREATE FUNCTION` (F1/F2) is a Postgres
footgun that has bitten many Supabase projects; it is a known and frequently-exploited class.

## Findings

| # | Severity | Title | Status |
|---|----------|-------|--------|
| F1 | **HIGH** | `tt_refresh_overtime_bank_stats` — cross-user read/write callable by `anon` | Fixed (migration) |
| F2 | **MEDIUM** | `tt_resolve_audit_user_id` — definer helper callable by `anon` | Fixed (migration) |
| F3 | **MEDIUM** | Unauthenticated open redirect at `/auth/callback?next=` | Fixed (code, verified live) |
| F4 | **MEDIUM** | Users can forge their own overtime bank, which Admin/HR read | Fixed (migration + code) |
| F5 | **MEDIUM** | `markdownToHtml` passes raw HTML tags through (incomplete T0.4 fix) | Fixed (code, verified by execution) |
| F6 | **LOW/MED** | `html_body` was the only create-draft field left unsanitized | Fixed (code) |
| F7 | **LOW** | Dashboard still read the role from `user_metadata` (residual T0.1) | Fixed (code) |
| F8 | **LOW** | Cron route: state-changing GET, no CSRF defence, no rate limit | Fixed (code, verified live) |

### F1 — HIGH · `tt_refresh_overtime_bank_stats` is a cross-user read/write callable by `anon`

`supabase/2026-07-16-public-holiday.sql:20-99` — the latest of five definitions of this function
(also `2026-04-16-overtime-bank-stats.sql:37`, `2026-04-16-weekend-overtime-recalc.sql:4`,
`2026-04-17-skip-overtime-refresh-on-user-delete.sql:48`, `2026-06-01-sick-leave.sql:19`).

Three facts combine:

- It is `security definer`, so it reads `time_day_logs` and `time_comp_adjustments` with RLS
  bypassed.
- It takes `p_user uuid` as an argument and **never compares it to `auth.uid()`**. It returns
  that user's total overtime-bank minutes and upserts their `time_tracker_user_stats` row.
- Its `grant execute ... to authenticated` at `:99` has **no accompanying
  `revoke all on function ... from public`**. Postgres grants `EXECUTE TO PUBLIC` by default on
  `CREATE FUNCTION`, and `CREATE OR REPLACE` preserves the existing ACL — so `anon` and
  `authenticated` both hold EXECUTE.

The asymmetry is stark and was the tell: `grep -n "revoke .*on function" web/supabase/*.sql`
returns 19 lines covering all 11 other RPCs. These two functions appear in none of them.

**Attack.** `POST /rest/v1/rpc/tt_refresh_overtime_bank_stats` with the public anon key and
`{"p_user": "<victim uuid>"}` returns the victim's overtime balance. Target UUIDs are free:
`chat_messages.sender_id` is readable by every authenticated user (policy `using (true)`, by
design for the team channel). The same call also writes the victim's stats row.

**Impact.** Defeats the RLS boundary the entire time-tracker schema is built on, from a position
requiring only the public anon key. Bounded to one derived integer per user — an overtime
balance — rather than the full day log, which is why this is HIGH and not CRITICAL.

**Fix.** `supabase/2026-07-26-rpc-privilege-hardening.sql`: revoke from `PUBLIC`, re-grant to
`authenticated`, and add a caller check as the function's first statement. The check is skipped
when `auth.uid()` is null, which is required — the statement triggers in
`2026-05-11-admin-perf-rpcs.sql` and every service-role path call it with no JWT context. When an
ordinary user's own DML fires those triggers, `auth.uid()` and `v_user` are the same id anyway,
because RLS guarantees they can only touch their own rows.

### F2 — MEDIUM · `tt_resolve_audit_user_id` — same root cause

`supabase/time-tracker-durability.sql:47-84`. `security definer`, and it has **neither** a
`revoke` nor a `grant` anywhere in the repo — so it sits on the pure default `PUBLIC EXECUTE`.
It is a trigger helper, but it is an ordinary `returns uuid` function and therefore directly
callable.

**Attack.** `rpc('tt_resolve_audit_user_id', {p_table_name: 'time_day_breaks',
p_new_row: {day_log_id: N}, p_old_row: null})` returns the owning `user_id` of any
`time_day_logs` row. `day_log_id` is a sequential `bigint identity`, so iterating it builds a
day-log-id → employee map and reveals roughly how many days each person has logged.

**Fix.** Revoked from `public`/`anon`/`authenticated` with no re-grant — only the audit trigger
calls it, and that runs as the definer. Same migration as F1.

### F3 — MEDIUM · Unauthenticated open redirect at `/auth/callback?next=`

`src/app/auth/callback/route.ts:8-9` built the redirect from an unvalidated query parameter:

```ts
const next = requestUrl.searchParams.get("next") ?? "/dashboard";
let response = NextResponse.redirect(new URL(next, requestUrl.origin));
```

`new URL(next, origin)` does not constrain anything: for an absolute or protocol-relative value
the base is discarded entirely. With no `code` parameter the exchange block is skipped and line
45 returns that redirect directly. `src/proxy.ts:8-10` scopes middleware to `/dashboard`,
`/settings` and `/login`, so this route has no gate at all.

**Attack.** `https://<app>/auth/callback?next=https://evil.example` — a phishing link carrying
the company's own trusted origin. No token leak: the OAuth code is consumed server-side and is
not forwarded in the `Location`, so this is phishing-grade, not account takeover.

**Fix.** New `src/lib/safe-redirect.ts` (`safeRedirectPath`) accepts only a path rooted at a
single `/`, rejecting absolute URLs, `//host`, backslash variants that browsers normalise to
`//`, and control characters. Colocated unit test, plus verified live against `next start`:

```
next=https://evil.example  -> location: http://localhost:3987/dashboard
next=//evil.example        -> location: http://localhost:3987/dashboard
next=/%5Cevil.example      -> location: http://localhost:3987/dashboard
next=/dashboard            -> location: http://localhost:3987/dashboard
```

### F4 — MEDIUM · Users can forge their own overtime bank, which Admin/HR then read

`supabase/2026-04-16-overtime-bank-stats.sql:19,31-35` granted `authenticated`
`select, insert, update` on `time_tracker_user_stats` with own-row policies but **no column
restriction and no value validation**. `overtime_bank_mins` is a *derived cache*, and
`tt_admin_overview` reads it verbatim into the Admin → Team time dashboard
(`2026-07-16-public-holiday.sql:255,260`).

**Attack.** From the browser with the anon key:
`update time_tracker_user_stats set overtime_bank_mins = 99999 where user_id = auth.uid()`.
The forged figure is what an admin or HR sees, and it survives until the user next edits a day —
the recompute triggers only fire on `time_day_logs` / `time_comp_adjustments` DML.

**Fix.** `supabase/2026-07-26-user-stats-integrity.sql` revokes `insert, update` from
`authenticated` and keeps `select`. The client-side upsert that made the grant necessary
(`src/lib/time-tracker-queries.ts`) now computes the value for display without persisting it;
the definer RPC remains the only writer. The own-row insert/update policies are deliberately
left in place — a policy never grants privilege, and keeping them is the conservative choice
given `force row level security` on this table.

### F5 — MEDIUM · `markdownToHtml` passed raw HTML tags straight through

`src/lib/mail-engine/html.ts:72-78` (before the fix):

```ts
const parts = c.split(/(<[^>]+>)/);
const merged = parts.map((part) => {
  if (part.startsWith("<")) return part;   // emits ANY tag-shaped source text verbatim
  return escapeHtmlText(part);
}).join("");
```

The split was meant to protect the tags this function had *generated*, but it cannot distinguish
them from tags already present in the source. **Confirmed by execution** in a standalone harness:
`<script>`, `<style>`, `<a href=…>` and `<img onerror=…>` all survived unescaped; only a bare `&`
was encoded.

run-2's T0.4 fix correctly hardened the URL interpolation (`safeAttrUrl`, `html.ts:12-21`) and
stopped there — this second hole in the same function is strictly worse, since it yields
arbitrary markup rather than an attribute breakout.

**Bounded impact, stated plainly.** The author is always an authenticated employee, and
`html_body` is never rendered in the app's DOM — the only `dangerouslySetInnerHTML` in the tree
is the static theme bootstrap at `layout.tsx:91`. So this was **not XSS**. What it was: a
broken escaping control, and a falsification of the guarantee documented at
`lib/mail-brief-llm.ts:14-15` ("the model never emits or formats links, so tracking can never
break"). Prose the LLM writes from a free-text brief — which routinely contains pasted customer
text — reached the outgoing customer email as live HTML.

**Fix.** Inverted the order. Markdown constructs are now swapped for `U+E000<n>U+E000`
placeholder tokens *before* the surrounding prose is escaped wholesale, then restored
afterwards. Generated markup never passes through the escaper, and the escaper never has to
guess what it produced itself. The sentinel is stripped from input up front so it cannot be
forged. Verified by execution — all five injection payloads escape, every legitimate construct
still renders, and `&` is escaped exactly once (no double-encoding).

### F6 — LOW/MEDIUM · `html_body` was the only create-draft field left unsanitized

`src/app/api/gmail/create-draft/route.ts` — every sibling field went through `sanitizeText` /
`sanitizeEmailList`; `html_body` was passed through with only a zod `.max(60000)`.

**Fix.** New `sanitizeMailHtml` in `lib/security/input-sanitize.ts` strips script/style/iframe
and friends, inline `on*=` handlers, and `javascript:`/`vbscript:`/`data:` URLs. It is explicitly
a denylist and explicitly a *second* layer — the primary control is F5. Commented as such so
nobody mistakes it for a real HTML sanitizer.

MIME header injection was checked and is **not** reachable: `sanitizeEmailList`
(`input-sanitize.ts:24-33`) regex-validates each address, so no CR/LF can reach `To:`/`Cc:`/`Bcc:`.

### F7 — LOW · Dashboard read the role from `user_metadata` (residual T0.1)

`src/app/dashboard/page.tsx:31-38` read `claims.user_metadata.role`, which flows to
`dashboard-shell.tsx:154-161` and renders the admin/Team-time tab for `userRole === "hr"`.
`settings/page.tsx` and `admin-guard.ts` correctly read `app_metadata`.

UI-only: a user who self-assigned `user_metadata.role = "hr"` got the tab rendered and then a 403
from every endpoint behind it, plus a `failed_admin_access` security event. But it was the last
live reader of the field T0.1 retired, and a trap for the next data fetch hung off `initialRole`.
Fixed, along with the stale docstring in `lib/user-role.ts`. `user_metadata` is still used for
genuine per-user preferences (appearance, travel mapping, signature) — that is correct and
unchanged.

### F8 — LOW · Cron route: state-changing GET, no CSRF defence, no rate limit

`src/app/api/cron/time-log-reminder/route.ts`. Authorization is solid — constant-time secret
compare, fails closed when `CRON_SECRET` is unset. But it is a `GET` with side effects, and
Supabase session cookies are `SameSite=Lax`, which **are** attached to a cross-site top-level
navigation. One admin click on a link fires `?send_test=attacker@evil.example` (mail from the
verified Resend domain to an arbitrary address, validated by one loose regex) or `?force=1`
(a real reminder blast). The route had no rate limit at all.

**Fix.** Added a per-IP rate limit (20/hour) and a `Sec-Fetch-Site` check that refuses
*cross-site* invocations of any request shape that can put mail on the wire — `send_test`,
`force`, and equally the plain unforced call when it lands inside the real Monday 09:00 Zurich
window. `preview` and `dry` runs stay reachable from anywhere. Admin-typed URLs
(`Sec-Fetch-Site: none`) and non-browser callers (Vercel Cron, curl — no `Sec-Fetch-*` headers at
all) are unaffected, so the documented runbook still works. Verified live:

```
send_test, cross-site nav (the attack)               -> 403
force=1,   cross-site nav (the attack)               -> 403
preview=html, cross-site (read-only)                 -> 200
send_test, Sec-Fetch-Site: none (admin typed it)     -> reaches send logic
send_test, no Sec-Fetch headers (cron/curl)          -> reaches send logic
```

## Hardening notes (defense-in-depth, not standalone findings)

- **H1 — CSP is Report-Only by default and currently inert.** `next.config.ts:10,72` selects the
  header name from `CSP_ENFORCE === "1"`, and the policy carries no `report-uri`/`report-to`, so
  nothing is blocked *and* nothing is collected. **This is an ops action, not a code change:**
  set `CSP_ENFORCE=1` in Vercel. Note `script-src 'unsafe-inline'` limits its XSS value even once
  enforced — dropping it needs a nonce pipeline for the theme bootstrap (`layout.tsx:91`).
- **H2 — T1.2 still open.** The rate limiter is an in-process `Map` (`lib/security/rate-limit.ts:18`);
  on Vercel each lambda instance has its own, so effective limits are a multiple of `max` and
  reset on cold start. Needs an infra decision (Upstash / Vercel KV / edge firewall). The IP
  source is correct (`x-real-ip` / `x-vercel-forwarded-for`, not the spoofable `x-forwarded-for`).
- **H3 — Rate-limit check precedes the auth check** in `/api/generate:69`, `/api/generate-brief:29`,
  `/api/render-brief:33`. Anonymous traffic can consume a shared per-IP bucket and lock out a
  legitimate user behind the same NAT. No cost is incurred (auth still rejects), so it is a
  nuisance-DoS, not a wallet issue.
- **H4 — `chat-attachments` had no `allowed_mime_types`** and the content-type is client-supplied
  (`lib/chat.ts:328`). Bucket is private, signed-URL, and on a *different origin* from the app,
  so this was never app-session XSS — but it is script execution on the Supabase origin.
  Addressed in `2026-07-26-chat-attachment-mime-allowlist.sql` with a deliberately broad list
  that excludes only browser-executable types (notably SVG).
- **H5 — `search_path = public, pg_catalog`** put `public` ahead of the catalog on definer
  functions. Only exploitable if a client role holds `CREATE` on schema `public`, which cannot be
  determined from the migration files. Both functions touched in this run were reordered to
  `pg_catalog, public, pg_temp`; **the remaining RPCs still use the old order** and the
  schema-privilege check below is worth running.
- **H6 — `/api/app-meta`** is unauthenticated and returns the deploy commit SHA. Fingerprinting
  only; left as-is.
- **H7 — `mail_recipient_search`** doesn't escape LIKE metacharacters in `p_query`. Bound
  parameter so no SQLi; admin-only; worst case a slow scan. Left as-is.
- **H8 — HR scope is wider than its docstring.** `guardTimeViewer`'s comment says HR "can only
  view summaries", but `/api/admin/time-user?user_id=` returns day-level `sick_leave`, break
  names and free-text comp notes for any user. That is plausibly correct for an HR role — it is
  flagged for a **conscious product decision**, not fixed, because narrowing it unasked could
  break a legitimate workflow.
- **H9 — HSTS lacked `preload`.** Added; submit the domain at hstspreload.org to complete it.
- **H10 — dev-dependency advisories.** `npm audit` reports 2 high, but
  `npm audit --omit=dev --audit-level=high` (the exact CI gate) reports **0** — they are all in
  dev dependencies and do not ship. CI is green.

## What the codebase does well (calibration)

Verified this run, not assumed:

- **Guards.** `guardAdmin`/`guardTimeViewer` fail closed at every branch, use `getUser()` (a
  verified Auth-server round-trip) rather than decoding a cookie, and read the role from
  `app_metadata`. An empty `ADMIN_EMAILS` rejects everyone. Blocked attempts by logged-in
  non-admins are recorded as `failed_admin_access` and feed a breach-alert threshold.
- **No IDOR on the service-role client.** Every route that touches `createAdminClient()` either
  derives the id from the session or sits behind a hard admin guard. Traced all call sites.
- **RLS.** All 17 tables have RLS enabled *and* forced. Per-user tables scope every policy on
  `auth.uid()`; service-role-only tables (`gmail_tokens`, `workspace_settings`,
  `security_events`, `admin_audit_log`, `mail_*`) are deny-all with grants revoked from both
  `anon` and `authenticated`. The two team-wide tables are intentionally global-read.
- **Secrets.** No `.env`, credentials, keys or service-account JSON in the worktree *or* anywhere
  in git history. Only two `NEXT_PUBLIC_` vars exist; no server-only secret reaches a client
  component; no `server-only` module is imported into one.
- **No injection surface.** Zero `.or(` / `.ilike(` / `.raw(` / template-literal SQL in `src/`.
  All 11 `.rpc()` call sites pass object-literal params. The only dynamic SQL in the schema is
  two constant-string `EXECUTE`s adding tables to a publication.
- **OAuth.** Gmail connect mints `randomBytes(16)` state into an HttpOnly, Secure, Lax cookie;
  the callback requires it to be present and equal, and clears it on every exit path.
- **Outbound.** No SSRF — the one non-constant fetch targets a fixed DuckDuckGo host with an
  encoded query and a 4s timeout, and its text never reaches the email body
  (`COMPANY_CONTEXT_LINE` is hardcoded `""` at `render.ts:78`).
- **Hygiene.** Zero security-related TODO/FIXME, no `@ts-ignore`, no debug/test endpoints, no
  dev bypass of any guard, no CORS headers anywhere, dependencies pinned behind a CI audit gate.

## Coverage across all three runs

- **run-1** — access control, public endpoints, OAuth, secrets → 4 findings, all fixed.
- **run-2** — mail-tracking, chat + Storage, Sheets, time-tracker, settings, RLS table sweep →
  2 findings, both fixed (one incompletely — see F5).
- **run-3** — **Postgres function privileges and definer semantics**, auth callback, outbound-HTML
  builder post-fix, cron route CSRF, role-read consistency → 8 findings, all fixed here.

**Residual areas for a future run:** a live-environment execution of the RLS/RPC suite against a
real anon JWT (this run reads SQL and now ships the probes, but did not execute them against the
database); the `search_path` ordering on the remaining nine RPCs (H5); and a pass over the
outgoing-email builders under the structured `/api/generate` path with fully hostile input.

## Verification performed

- `npm run test` — 11 files, 69 tests, all passing, including the new `safe-redirect`,
  `input-sanitize` and `markdownToHtml` injection suites.
- `npm run lint` — clean.
- `npm run build` — clean (typecheck included).
- `npm audit --omit=dev --audit-level=high` — 0 vulnerabilities (the CI gate).
- Live `next start`: security headers confirmed emitting; F3 and F8 confirmed fixed by request.
- F5 confirmed both before (vulnerable) and after (fixed) by executing the escaper in isolation.

**Not verified, and it matters:** F1/F2 rest on the live `proacl` of two functions, which I read
from the migrations but could not query — the database was not reachable from this session. Run
the check in `2026-07-26-rpc-privilege-hardening.sql`'s header before and after applying it.
