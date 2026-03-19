# Security Secrets Runbook

This runbook defines how secrets are stored, rotated, and safely handled for this project.

## 1) Required Secrets

### Application (web)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`

## 2) Storage Policy

- Production secrets must be stored in the deployment secret manager (Vercel project environment variables).
- Do not commit secrets into the repository.
- Do not place secrets in Markdown docs, screenshots, or issue comments.
- Local development secrets live only in local `.env` files that remain untracked.

## 3) Rotation Policy (90 days)

- Rotate all high-impact credentials every 90 days:
  - Supabase service role key
  - Google OAuth client secret
- Rotate immediately after any suspected leak.
- During rotation:
  1. Create new credential.
  2. Update secret manager values.
  3. Deploy.
  4. Verify login, Gmail draft flow, and API routes.
  5. Revoke old credential.

## 4) Incident Response (Suspected Leak)

1. Revoke the leaked key immediately.
2. Issue replacement key and update environment values.
3. Redeploy and validate critical flows.
4. Review recent logs and access history.
5. Document incident and corrective actions.

## 5) Safe Error And Logging Rules

- Never log raw access tokens, refresh tokens, API keys, passwords, or full `Authorization` headers.
- Never return secret-bearing provider errors directly to clients.
- Return generic 500 responses for upstream/provider failures.
- Keep sensitive debugging details in secure, internal logs only.

## 6) Pre-Deployment Checklist

- [ ] No secrets in git diff.
- [ ] OAuth redirect URLs validated for both production and localhost.
- [ ] Required env vars are present in deployment platform.
- [ ] Latest key rotation date recorded.
