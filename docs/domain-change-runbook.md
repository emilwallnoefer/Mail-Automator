# Domain Change Runbook

How to move this app to a different domain, and a record of the last move.

**Last executed: 2026-07-25** — `mail-automator.vercel.app` → `flya.space`.

## The rule that matters most

**Never detach the previous production domain from the Vercel project.**

Every `/r/<id>` tracking link in every email already sent is baked into the
hostname that was current when the draft was created. The redirector
(`web/src/app/r/[id]/route.ts`) looks clicks up by id, so those links keep
working forever — *as long as that hostname still reaches the app*. Detach it and
all historical click tracking dies silently, with no error anywhere.

`mail-automator.vercel.app` therefore stays attached indefinitely. Same applies
to any future former domain.

Related: some very early sends (May 2026) used a *deployment-specific* hostname
(`mail-automator-<hash>-<team>.vercel.app`) because `NEXT_PUBLIC_SITE_URL` was
unset and the code fell back further down the chain. Those links depend on an
immutable deployment URL rather than on a stable alias. Nothing to fix
retroactively; setting `NEXT_PUBLIC_SITE_URL` explicitly is what prevents it
recurring, which is why `web/src/lib/email/link-tracker.ts` deliberately never
reads `VERCEL_URL`.

## What is domain-dependent

No application code hardcodes the app's hostname. Everything resolves from env:

| Where | Source | Purpose |
|---|---|---|
| `web/src/lib/email/link-tracker.ts` | `NEXT_PUBLIC_SITE_URL` → `VERCEL_PROJECT_PRODUCTION_URL` → request origin | `/r/<id>` links in **customer** email |
| `web/src/lib/mail-engine.ts` | `NEXT_PUBLIC_SITE_URL` → `VERCEL_URL` | absolute image URLs in email HTML |
| `web/src/app/api/cron/time-log-reminder/route.ts` | `APP_BASE_URL` → request origin | dashboard link in **internal** reminder email |
| Gmail + Sheets OAuth | `GOOGLE_OAUTH_REDIRECT_URI` | consent round-trip |
| Login / auth callback | request origin | domain-agnostic, nothing to change |

`NEXT_PUBLIC_SITE_URL` is compiled in at build time. **Changing it requires a
redeploy** — saving the env var alone does nothing.

## Order of operations

Add the new domain everywhere first, keep the old one working, switch last. Every
allowlist accepts both origins simultaneously, so there is no downtime window and
you can stop after any phase.

1. **Vercel** — Settings → Domains → add the domain, wait for Valid Configuration
   + issued TLS. Do not make it primary yet. Optionally add `www` as a redirect to
   the apex (not the reverse — the env vars point at the apex).
2. **Resend** (only if the sending domain moves) — add the domain, create its DNS
   records, wait for Verified. Start this early; it is the only step with real
   lead time. Prefer **Manual setup** over Auto-configure, which wants write
   access to your DNS.
3. **Google Cloud** — add `https://<newdomain>/api/gmail/callback` to the Gmail
   OAuth client. Keep the old URI. **Never touch the `.supabase.co/auth/v1/callback`
   URI** — that belongs to the Supabase login flow and is domain-independent.
4. **Supabase** — Authentication → URL Configuration → add
   `https://<newdomain>/auth/callback` and `https://<newdomain>/**` to Redirect
   URLs. Keep existing entries, including all `localhost` ones. Leave Site URL for
   the cutover.
5. **Vercel env (Production scope)** — set `NEXT_PUBLIC_SITE_URL`, `APP_BASE_URL`,
   `GOOGLE_OAUTH_REDIRECT_URI`. Leave Preview/Development pointing at the old
   values so preview deployments keep behaving as before.
6. **Cutover** — make the domain primary, set Supabase Site URL, update
   `RESEND_FROM` (only once Resend says Verified), then **redeploy Production**.
   Everyone gets signed out: a new origin means a new cookie jar.
7. **Verify** — see the checklist in `https-auth-redirect-checklist.md`. The
   non-obvious one: click a `/r/<id>` link from an *older* email and confirm it
   still records.

Rollback is fast because nothing was removed: make the old domain primary again,
revert the three env vars, redeploy.

## DNS gotcha when Vercel manages DNS

Resend displays **absolute** record names; Vercel's DNS panel wants the name
**relative** to the zone. Appending the domain produces
`send.flya.space.flya.space`, and verification fails with no useful error.

| Resend shows | Enter in Vercel |
|---|---|
| `send.flya.space` | `send` |
| `resend._domainkey.flya.space` | `resend._domainkey` |
| `flya.space` (zone apex) | *(leave empty)* |

## 2026-07-25 migration record

- **Vercel** — `flya.space` added, DNS auto-configured (domain bought through
  Vercel), TLS issued, set primary. `www.flya.space` → apex as a 307.
  `mail-automator.vercel.app` retained.
- **Resend** — `flya.space` verified in the EU (`eu-west-1`) region, manual DNS
  setup. Records: DKIM `TXT` at `resend._domainkey`; `MX` at `send` →
  `feedback-smtp.eu-west-1.amazonses.com` prio 10; SPF `TXT` at `send` →
  `v=spf1 include:amazonses.com ~all`; `TXT` at `_dmarc` → `v=DMARC1; p=none;`.
  The previous sending domain was removed (free plan allows one).
  `RESEND_FROM` = `Flya Allrounder <noreply@flya.space>`.
- **Google** — new redirect URI added to "Web client 1" in the Google Cloud project
  `mail-automator-drafts`. Existing Gmail connections survived; no reconnect was
  needed, since stored refresh tokens are unaffected by redirect-URI changes.
  The OAuth consent screen was published out of "Testing" straight afterwards —
  Google expires refresh tokens for unpublished apps after 7 days, which had
  been forcing users to reconnect Gmail every week.
- **Supabase** — Site URL updated; six Redirect URLs, both origins present.
- **Verification** — all checks passed, including an older
  `mail-automator.vercel.app/r/...` link still resolving and recording, and a
  test reminder delivered to Inbox (not spam) with no unverified-sender warning.

### What Resend actually carries

Only two internal flows send via Resend — the weekly time-log reminder and
`web/src/lib/security/breach-alert.ts`. Customer training email goes out as
Gmail **drafts** from the sender's own account, never through Resend. Anything
that breaks Resend therefore affects internal mail only, which is worth
remembering before paying for a plan upgrade to solve a sender-address problem.
