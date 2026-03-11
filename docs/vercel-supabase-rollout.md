# Vercel + Supabase Setup (2-person internal helper)

This guide deploys the web app in `web/` for you and one colleague.

## 1) Supabase project

1. Create a Supabase project.
2. In `Project Settings -> API`, copy:
   - `Project URL`
   - `anon public key`
3. In `Authentication -> URL Configuration` set:
   - **Site URL**: your Vercel production URL (later), e.g. `https://mail-helper.vercel.app`
   - **Redirect URLs**:
     - `http://localhost:3000/auth/callback`
     - `https://mail-helper.vercel.app/auth/callback`
4. In `Authentication -> Providers -> Email`, enable email/password sign-in.

## 2) Local run

From project root:

```bash
cd web
cp .env.example .env.local
```

Set values in `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI` (local: `http://localhost:3000/api/gmail/callback`)
Then run:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## 3) Vercel deploy

1. Push this folder to GitHub.
2. In Vercel:
   - Import repository
   - Set **Root Directory** to `web`
3. Add environment variables in Vercel project settings:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `GOOGLE_OAUTH_CLIENT_ID`
   - `GOOGLE_OAUTH_CLIENT_SECRET`
   - `GOOGLE_OAUTH_REDIRECT_URI` (prod: `https://<your-domain>/api/gmail/callback`)
4. Deploy.

## 4) Google OAuth setup (for Gmail draft creation)

1. In Google Cloud Console, create OAuth credentials for a web application.
2. Add authorized redirect URIs:
   - `http://localhost:3000/api/gmail/callback`
   - `https://<your-domain>/api/gmail/callback`
3. Enable Gmail API in the same project.

## 5) Final auth URL sync

After first Vercel deploy:

1. Copy production URL.
2. Go back to Supabase `Authentication -> URL Configuration`.
3. Update:
   - Site URL = production URL
   - Redirect URL = `<production-url>/auth/callback`

## 6) Colleague onboarding

1. Share app URL.
2. Colleague signs in with email + password.
3. In dashboard, click **Connect Gmail** once.
4. Generate mail preview and click **Create Gmail draft**.

## Notes

- This app is draft-helper UX and auth shell for team usage.
- Keep Gmail draft creation logic behind explicit confirmation (draft only).
- Upgrade to paid plans once usage increases or if team policy requires non-Hobby hosting.
