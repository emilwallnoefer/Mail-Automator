# How the Mail Automator app and its data are secured

**Date:** 2026-07-26 · **Audience:** engineering · **Status:** post audit run-3, fixes on `worktree-security-audit-run3`

This is the mail-form write-up of where the app's security stands: what data it holds, how each
layer protects it, what the third security audit found, what I fixed, and what is still open and
needs a decision from someone other than me. Full artifacts are in
`web/docs/security-audit/run-3/`.

---

## 1. What we actually hold

Worth being concrete, because the protections only make sense against the data:

| Data | Where | Sensitivity |
|---|---|---|
| Time logs — start/stop, breaks, **sick leave**, holidays, free-text comp notes | `time_day_logs`, `time_day_breaks`, `time_comp_adjustments` | Personal / HR |
| Derived overtime balance | `time_tracker_user_stats` | HR |
| Employee directory + role assignments | Supabase `auth.users` (`app_metadata.role`) | Internal |
| Team chat messages and attachments | `chat_messages`, `chat_message_votes`, `chat-attachments` bucket | Internal, team-wide by design |
| Mail tracking — recipients, subjects, link clicks | `mail_sends`, `mail_send_links`, `mail_link_clicks` | Customer PII |
| **Gmail OAuth refresh tokens** | `gmail_tokens` | Secret — grants mailbox access |
| Workspace settings, admin audit log, security events | `workspace_settings`, `admin_audit_log`, `security_events` | Internal |

The two things that would hurt most if they leaked are the Gmail refresh tokens and the
time/sick-leave data. Both get the strongest treatment below.

---

## 2. The layers, and what each one is actually good for

**Identity.** Supabase Auth via Google OAuth. The callback enforces `@flyability.com` and signs
out anyone else. Sessions are HttpOnly + Secure + SameSite=Lax cookies managed by `@supabase/ssr`.

**Two independent gates, deliberately.** `src/proxy.ts` refreshes the session and gates
`/dashboard`, `/settings`, `/login` — and it fails *closed*, redirecting to `/login` if the auth
server errors. But it is explicitly **not** the security boundary: every gated page re-checks
server-side, and **no API route relies on the proxy at all**. All 31 routes carry their own check.
That is why a middleware bypass (the CVE-2025-29927 class) would not expose anything here.

**Authorization.** Two guards in `src/lib/admin-guard.ts`:
- `guardAdmin()` — admin is an **env allowlist** (`ADMIN_EMAILS`), not a database row, so it
  cannot be reached by manipulating any data the user can touch. Empty var ⇒ everyone rejected.
- `guardTimeViewer()` — admin *or* `role === 'hr'`, read from **`app_metadata`**, which only the
  service role can write. (`user_metadata` is user-writable and must never carry a role — that
  was run-1's HIGH finding, fixed in July.)

Both use `getUser()`, a verified round-trip to the auth server, not a decoded cookie. Both fail
closed on every branch. **The invariant:** nothing touches the service-role client (which
bypasses RLS) before one of these returns ok. I traced every call site this run; it holds.

**Row Level Security.** All 17 tables have RLS `enable`d **and** `force`d. Per-user tables scope
every policy on `auth.uid()`. Tables holding secrets or audit data — `gmail_tokens`,
`workspace_settings`, `security_events`, `admin_audit_log`, all three `mail_*` tables — are
deny-all with grants revoked from both `anon` and `authenticated`; the service role is the only
way in. The two team-wide tables (chat) are intentionally global-read.

**Secrets.** `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `CRON_SECRET`, `RESEND_*` are all
read only from modules marked `"server-only"`, which makes it a build error to import them into a
client component. Gmail refresh tokens live in a service-role-only table, never in the JWT. I
grepped every tracked file **and the entire git history** for committed credentials — nothing.

**Input handling.** Every route validates with zod and passes text through shared sanitizers.
Email addresses are regex-validated per entry, which is what makes MIME header injection
unreachable on the draft endpoint.

**Transport and browser.** HSTS (now with `preload`), `X-Frame-Options: DENY`, `nosniff`,
`Referrer-Policy`, `Permissions-Policy`, and a CSP with `frame-ancestors 'none'`,
`object-src 'none'`, `base-uri 'self'`, `form-action 'self'`. No CORS headers anywhere — nothing
is opened cross-origin.

**Detection.** Blocked admin attempts by logged-in non-admins are written to `security_events`
and feed a breach-alert email to admins over a threshold. So probing is visible, not silent.

---

## 3. What run-3 found

Runs 1 and 2 (July 2nd) found 6 issues; **all are genuinely fixed** — I re-verified each against
source rather than trusting the changelog. This run went after ground they never covered, and the
most productive area was **Postgres function privileges**.

### The one that matters — HIGH

**Any holder of the public anon key could read any employee's overtime balance.**

`tt_refresh_overtime_bank_stats` is a `SECURITY DEFINER` function, so it reads the time tables
with RLS bypassed. It takes a user id as an argument and **never compares it to `auth.uid()`**.
And unlike every other RPC in our schema, its grant was never paired with
`revoke ... from public` — Postgres grants `EXECUTE TO PUBLIC` by default on `CREATE FUNCTION`,
and `CREATE OR REPLACE` preserves that ACL, so it stayed open across all five times we
redefined the function.

One call returns a colleague's overtime balance:
```js
supabase.rpc('tt_refresh_overtime_bank_stats', { p_user: '<colleague uuid>' })
```
Colleague UUIDs are free — `chat_messages.sender_id` is readable by every authenticated user, as
the shared channel intends. A second definer function, `tt_resolve_audit_user_id`, had the same
root cause and maps day-log ids to their owners.

**Two things worth taking from this beyond the fix:**

1. **Our RLS smoke test was structurally blind to it.** `scripts/rls-smoke.mjs` tested cross-user
   *table* isolation carefully — and never called an RPC. A definer function bypasses RLS by
   design, so no amount of table-level testing can see this class. I've added RPC probes.
2. **The tell was an inconsistency, not a smell.** Every other RPC revokes; these two didn't.
   Worth grepping for that pattern whenever we add a function.

### The rest

| Sev | Finding | Note |
|---|---|---|
| MED | `tt_resolve_audit_user_id` callable by `anon` | Same root cause as above |
| MED | **Open redirect** at `/auth/callback?next=` | `?next=https://evil.example` 307'd off-site from *our* domain. Unauthenticated, no middleware coverage. Phishing-grade — no token leak |
| MED | Users could **forge their own overtime balance** | `time_tracker_user_stats` was client-writable; Admin → Team time reports it verbatim. Integrity, in the employee's own favour |
| MED | `markdownToHtml` **passed raw HTML tags through** | The escaper split on `/(<[^>]+>)/` and passed through anything tag-shaped — it can't tell tags it generated from tags in the source |
| LOW | `html_body` was the only draft field left unsanitized | Compounds the above |
| LOW | Dashboard still read the role from `user_metadata` | Rendered the HR tab for anyone; every endpoint behind it still 403'd |
| LOW | Cron route: mail-sending **GET**, no CSRF defence, no rate limit | `SameSite=Lax` cookies ride cross-site navigations, so one admin click on a link fired `?send_test=` or a real blast |

**On the HTML one, being precise about impact rather than alarming:** this was **not XSS**.
`html_body` is never rendered in our DOM — the only `dangerouslySetInnerHTML` in the tree is a
static theme bootstrap. The author is always an authenticated employee. What it actually was is a
broken escaping control, and a falsification of the guarantee we document in
`mail-brief-llm.ts` — "the model never emits or formats links, so tracking can never break".
Brief-mode prose is LLM-written from a free-text brief that routinely contains pasted customer
text, so injected markup reached the customer email as live HTML. Also notable: this is the
*second* hole in that one function; run-2's fix hardened the URL interpolation and stopped there.

---

## 4. What I changed

**Code** (all tested, linted, builds clean):
- `lib/safe-redirect.ts` — new; rejects absolute URLs, `//host`, backslash tricks, control chars.
  Wired into the auth callback, with a colocated unit test.
- `lib/mail-engine/html.ts` — inverted the escaping order. Markdown constructs become opaque
  placeholder tokens *before* the prose is escaped wholesale, then get restored. Generated markup
  never passes through the escaper, so the escaper never has to guess what it produced.
- `lib/security/input-sanitize.ts` — new `sanitizeMailHtml`, applied to `html_body`. Explicitly a
  denylist and explicitly a *second* layer; the primary control is the renderer fix above.
- `dashboard/page.tsx` — role now read from `app_metadata`. No reader from `user_metadata`
  remains anywhere.
- `cron/time-log-reminder` — per-IP rate limit + a `Sec-Fetch-Site` check that refuses
  *cross-site* invocation of anything that can send mail. Admin-typed URLs and Vercel Cron are
  unaffected, so the runbook still works.
- `scripts/rls-smoke.mjs` — RPC probes, plus a check that the stats cache is read-only to clients.
- `next.config.ts` — `preload` on HSTS.

**Three migrations — must be applied by hand, before the code deploys.** `web/supabase/` is a
flat, un-orchestrated directory, same rule as the July 3rd batch:

1. `2026-07-26-rpc-privilege-hardening.sql` — revokes PUBLIC from both definer functions, adds
   the `auth.uid()` caller check, pins `search_path` with `pg_catalog` first.
2. `2026-07-26-user-stats-integrity.sql` — revokes `insert, update` on `time_tracker_user_stats`
   from `authenticated`, keeps `select`.
3. `2026-07-26-chat-attachment-mime-allowlist.sql` — MIME allowlist on the attachments bucket.

**Verification:** 69 tests pass across 11 files; lint and build clean; `npm audit --omit=dev
--audit-level=high` (the exact CI gate) reports 0. The open redirect and the cron CSRF guard were
confirmed fixed against a running server, and the HTML escaper was confirmed both broken before
and fixed after by executing it in isolation.

**One caveat I want to be explicit about:** the two RPC findings rest on the live `EXECUTE` ACL,
which I read from the migrations but could not query — the database wasn't reachable from my
session. The confirming query is in the migration's header comment; please run it before and
after applying.

---

## 5. Still open — these need a decision, not more code

1. ~~**CSP is Report-Only, and currently inert.**~~ **Done — `CSP_ENFORCE=1` set in Vercel
   (2026-07-26).** The policy now blocks rather than observes. Confirm on the deployed site with
   `curl -sI https://<app-domain>/login | grep -i content-security-policy` — the header name must
   be `Content-Security-Policy`, *not* `...-Report-Only`.
   **Remaining caveat:** `script-src` still carries `'unsafe-inline'` for the theme bootstrap in
   `layout.tsx`, so the policy is a solid framing/exfiltration control (`frame-ancestors 'none'`,
   `connect-src` pinned to self + Supabase, `object-src 'none'`, `base-uri`/`form-action 'self'`)
   but **not yet a strong XSS backstop**. Closing that means giving the bootstrap script a nonce
   so `'unsafe-inline'` can be dropped. Separate, smaller piece of work.
2. **Rate limiting is not durable** (the one Tier-1 item never closed). It's an in-process `Map`,
   so on Vercel each lambda has its own and limits reset on cold start. Fine as a courtesy
   throttle, not a security control. Closing it means Upstash / Vercel KV / the edge firewall —
   an infra decision.
3. **HR's data scope is wider than its docstring claims.** `guardTimeViewer` says HR "can only
   view summaries", but `/api/admin/time-user?user_id=` returns day-level sick leave, break names
   and free-text comp notes for any employee. That may well be exactly right for an HR role — I
   deliberately did **not** narrow it, because guessing wrong would break a legitimate workflow.
   It needs a product answer, and then either the code or the docstring should change.
4. **`search_path` ordering on the other nine RPCs.** I fixed the two I touched. The rest still
   list `public` before `pg_catalog`, which only matters if a client role holds `CREATE` on
   schema `public`. One query settles it:
   ```sql
   select has_schema_privilege('anon','public','CREATE'),
          has_schema_privilege('authenticated','public','CREATE');
   ```
5. **HSTS preload** needs the domain submitted at hstspreload.org to take effect.

---

## 6. Where I'd push back on being reassured

Three runs have now found something every time, which is the honest read on any codebase this
size — not a sign of decline. What's changed is *where*: run-1 found architectural mistakes
(secrets in the wrong store), run-2 found integrity gaps, run-3 had to go to Postgres grant
semantics to find its HIGH. That trend is the right direction.

The genuinely strong parts, which I verified rather than assumed: the guard invariant holds
across all 31 routes with no IDOR on the service-role client; RLS is correct across all 17
tables; there are no committed secrets anywhere in history; there's no SQL or PostgREST filter
injection surface at all; OAuth `state` is properly implemented; and there are zero
security-related TODOs, debug endpoints, or dev bypasses.

The weak spot is not the code — it's that **two of our defensive layers were quietly not
running**: the CSP is Report-Only in production, and the RLS test suite couldn't see the class of
bug that produced this run's HIGH. A control you believe is on is worse than one you know is off.
Both are addressed above; item 1 is the one I'd do this week.
