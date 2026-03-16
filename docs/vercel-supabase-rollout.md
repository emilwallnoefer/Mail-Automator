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
- `GOOGLE_SHEETS_SPREADSHEET_ID`
- `GOOGLE_SHEETS_RANGE` (example: `A:R`)
- `GOOGLE_SHEETS_DATE_MONTH_YEAR_COLUMN` (set `A`)
- `GOOGLE_SHEETS_DATE_DAY_COLUMN` (set `C`)
- `GOOGLE_SHEETS_COL_CLIENT` (set `P`)
- `GOOGLE_SHEETS_COL_LOCATION` (set `Q`)
- `GOOGLE_SHEETS_COL_RESPONSIBLE` (set `R`)
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
   - `GOOGLE_SHEETS_SPREADSHEET_ID`
   - `GOOGLE_SHEETS_RANGE`
   - `GOOGLE_SHEETS_DATE_MONTH_YEAR_COLUMN`
   - `GOOGLE_SHEETS_DATE_DAY_COLUMN`
   - `GOOGLE_SHEETS_COL_CLIENT`
   - `GOOGLE_SHEETS_COL_LOCATION`
   - `GOOGLE_SHEETS_COL_RESPONSIBLE`
4. Deploy.

## 4) Google OAuth setup (for Gmail draft creation)

1. In Google Cloud Console, create OAuth credentials for a web application.
2. Add authorized redirect URIs:
   - `http://localhost:3000/api/gmail/callback`
   - `https://<your-domain>/api/gmail/callback`
3. Enable Gmail API and Google Sheets API in the same project.
4. OAuth scope must include:
   - `https://www.googleapis.com/auth/gmail.compose`
   - `https://www.googleapis.com/auth/spreadsheets.readonly`
5. If Gmail was already connected before adding Sheets scope, disconnect/reconnect once so the refresh token gets the new permission.

## 4.1 Travel sheet mapping used by Time Tracker

The tracker reads per-date travel info from your sheet with this mapping:

- Date = composed from `A` (month+year text, e.g. `January 2026`) + `C` (day number, e.g. `25`)
- `P` = Client
- `Q` = Location
- `R` = Responsible sales person

In Day Logger, this appears in a read-only right-side info pane for the selected date.

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
