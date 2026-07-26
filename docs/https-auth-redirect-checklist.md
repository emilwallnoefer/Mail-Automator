# HTTPS And Auth Redirect Checklist

Use this checklist for every environment change (localhost, staging, production).

Current production origin: **`https://flya.space`** (since 2026-07-25).
Previous origin `https://mail-automator.vercel.app` is still attached to the
Vercel project on purpose — see `domain-change-runbook.md`. Do not detach it.

## 1) Canonical URLs

- [ ] Production app URL uses HTTPS and no path suffix (`https://flya.space`).
- [ ] Supabase Site URL exactly matches canonical production origin.
- [ ] Local development URL is explicitly listed for OAuth callback tests.
- [ ] `www.flya.space` redirects to the apex (307), and the apex is **not**
      redirected to `www` — `NEXT_PUBLIC_SITE_URL` points at the apex.

## 2) Supabase Auth URL Configuration

Project: **Mail Automator**, ref `htulokywtznshwlzhnxj` (org "emilwallnoefer's Org") —
the only Supabase project on the account. Settings below live under
Authentication → URL Configuration. Do not confuse this with the *Google Cloud*
project in §3.

- [ ] Site URL: `https://flya.space`
- [ ] Additional Redirect URLs include:
  - [ ] `https://flya.space/auth/callback`
  - [ ] `https://flya.space/**`
  - [ ] `https://mail-automator.vercel.app/auth/callback` (kept; former origin)
  - [ ] `http://localhost:3000/auth/callback`
  - [ ] `http://localhost:3000/**`
  - [ ] `http://127.0.0.1:3000/**` (optional fallback)
  - [ ] `https://mail-automator-git-*-emilwallnoefers-projects.vercel.app/**` — Vercel
        preview deploys, branch-alias form (added 2026-07-26). This is the host behind
        the "Visit Preview" link on a PR.
  - [ ] `https://mail-automator-*-emilwallnoefers-projects.vercel.app/**` — the same
        previews reached by their **per-deployment** URL
        (`mail-automator-<build-hash>-…`), which the entry above does not match:
        Supabase's `*` spans a single host segment and that hostname has no `git-`.
        This broader pattern subsumes the branch-alias entry, so keeping both is
        belt-and-braces — drop the narrower one if you prefer one line.

  Why previews break without these: an unlisted origin does **not** error. Supabase
  falls back to the Site URL, so you silently land on production while looking like a
  failed preview. `app/login/page.tsx` builds the return URL from
  `window.location.origin`, which is whichever preview host you opened.

  Previews run against the **production database**. Reaching `/dashboard` is enough to
  prove the redirect works; going further writes real rows (`mail_sends`, chat messages,
  time logs), so use a throwaway account and stay out of the modules.

## 3) Google OAuth Provider

Both clients below live in the **Google Cloud** project `mail-automator-drafts`
(console.cloud.google.com → APIs & Services → Credentials). That name belongs to
Google Cloud only — there is no Supabase project by that name; the Supabase one is
in §2.

Two separate OAuth clients are involved. Do not confuse them.

- [ ] **Supabase login** — the client used by the Supabase Google provider has
      Authorized Redirect URI `https://htulokywtznshwlzhnxj.supabase.co/auth/v1/callback`.
      This is **independent of the app's domain** and must never be edited during
      a domain change. It is the client named "google login".
- [ ] **Gmail / Sheets integration** — the client named "Web client 1" (matches
      `GOOGLE_OAUTH_CLIENT_ID`) has Authorized Redirect URIs:
  - [ ] `https://flya.space/api/gmail/callback`
  - [ ] `https://mail-automator.vercel.app/api/gmail/callback` (kept)
  - [ ] `http://localhost:3000/api/gmail/callback`
- [ ] Google provider is enabled in Supabase.
- [ ] Client ID/Secret are configured in Supabase Provider settings.

One client and one callback path serve both Gmail and Sheets: `GMAIL_SCOPES` in
`web/src/lib/gmail.ts` requests `gmail.compose` **and** `spreadsheets.readonly`,
so a single consent covers both. There is no `/api/google-sheets/callback` route
in this app.

## 4) HTTPS Enforcement

- [ ] Deployment platform forces HTTPS (no HTTP-only origin).
- [ ] Any custom domain has valid TLS certificate.
- [ ] No hard-coded `http://` production redirects in app code.

## 5) Validation Smoke Tests

- [ ] Local login: start at `http://localhost:3000/login`, complete Google auth, return to localhost callback.
- [ ] Production login: start at `https://flya.space/login`, complete Google auth, return to production callback.
- [ ] Non-`@flyability.com` account gets rejected and signed out.
- [ ] Authenticated user can reach `/dashboard`; unauthenticated user is redirected to `/login`.
- [ ] Former origin `https://mail-automator.vercel.app` still serves the app.
- [ ] A `/r/<id>` link from an **older** sent email still resolves and still
      records the click.

## 6) Post-Change Hygiene

- [ ] Clear cookies for localhost and production domains after URL changes.
- [ ] Re-test with private browsing mode to rule out stale session artifacts.
- [ ] Document change date and operator in deployment notes.
