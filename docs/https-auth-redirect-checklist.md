# HTTPS And Auth Redirect Checklist

Use this checklist for every environment change (localhost, staging, production).

## 1) Canonical URLs

- [ ] Production app URL uses HTTPS and no path suffix (example: `https://mail-automator.vercel.app`).
- [ ] Supabase Site URL exactly matches canonical production origin.
- [ ] Local development URL is explicitly listed for OAuth callback tests.

## 2) Supabase Auth URL Configuration

- [ ] Site URL: `https://mail-automator.vercel.app`
- [ ] Additional Redirect URLs include:
  - [ ] `https://mail-automator.vercel.app/auth/callback`
  - [ ] `https://mail-automator.vercel.app/**`
  - [ ] `http://localhost:3000/auth/callback`
  - [ ] `http://localhost:3000/**`
  - [ ] `http://127.0.0.1:3000/**` (optional fallback)

## 3) Google OAuth Provider

- [ ] Google OAuth client has Authorized Redirect URI:
  - [ ] `https://<supabase-project-ref>.supabase.co/auth/v1/callback`
- [ ] Google provider is enabled in Supabase.
- [ ] Client ID/Secret are configured in Supabase Provider settings.

## 4) HTTPS Enforcement

- [ ] Deployment platform forces HTTPS (no HTTP-only origin).
- [ ] Any custom domain has valid TLS certificate.
- [ ] No hard-coded `http://` production redirects in app code.

## 5) Validation Smoke Tests

- [ ] Local login: start at `http://localhost:3000/login`, complete Google auth, return to localhost callback.
- [ ] Production login: start at `https://mail-automator.vercel.app/login`, complete Google auth, return to production callback.
- [ ] Non-`@flyability.com` account gets rejected and signed out.
- [ ] Authenticated user can reach `/dashboard`; unauthenticated user is redirected to `/login`.

## 6) Post-Change Hygiene

- [ ] Clear cookies for localhost and production domains after URL changes.
- [ ] Re-test with private browsing mode to rule out stale session artifacts.
- [ ] Document change date and operator in deployment notes.
