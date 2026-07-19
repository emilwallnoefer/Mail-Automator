# CSP enforcement — ops runbook

The app ships a Content-Security-Policy from `web/next.config.ts`. By default it is
sent as **`Content-Security-Policy-Report-Only`**: browsers evaluate it and log
violations but do **not** block anything. Enforcement is flipped by an env var, not
by a code change, so it can be turned on (and off) without a deploy edit.

- Report-Only (default): `CSP_ENFORCE` unset or ≠ `1`.
- Enforcing: `CSP_ENFORCE=1`.

The policy is defined once (`const csp`) and emitted under whichever header name the
flag selects, so **the Report-Only policy you verify is byte-for-byte the one that
gets enforced.** What you see in staging is what you get.

## What the policy allows (and why)

| Directive | Value | Reason |
|---|---|---|
| `default-src` | `'self'` | Baseline; everything unlisted falls back to same-origin. |
| `script-src` | `'self' 'unsafe-inline'` | The theme bootstrap in `app/layout.tsx` is an inline `<script>`; Next also inlines bootstrap. No nonce pipeline yet, so `'unsafe-inline'` is required. **No `'unsafe-eval'` in production.** |
| `style-src` | `'self' 'unsafe-inline'` | Tailwind and framer-motion (`m.*`) set inline styles. |
| `img-src` | `'self' data: blob: https:` | Mail-tracking pixels, Supabase Storage signed URLs, and the html-to-image day-log card (data:-URI SVG → blob). |
| `font-src` | `'self' data:` | `next/font/google` self-hosts Geist at build time — no runtime `fonts.gstatic.com`. |
| `connect-src` | `'self'` + Supabase REST host + Supabase `wss://` | Supabase REST + Realtime are the only browser-side external endpoints. Gmail, Google Sheets and Resend are all **server-side** — no browser origin needed. |
| `frame-src` | `'self'` | The app embeds no iframes. |
| `frame-ancestors` / `object-src` | `'none'` | No embedding of us; no plugins. |
| `form-action` / `base-uri` | `'self'` | Lock down form posts and `<base>`. |
| `worker-src` | `'self' blob:` | Defensive; html-to-image may spin a blob worker. |

### Preview-only widening (Vercel Live)

Preview deployments load the Vercel Live/Comments toolbar from `https://vercel.live`
(backed by a Pusher websocket). When `VERCEL_ENV === "preview"` the policy adds
`vercel.live` + `'unsafe-eval'` to `script-src`, `vercel.live` to `style-src`/
`frame-src`/`font-src` (+ `assets.vercel.com`), and `https://vercel.live` +
`wss://ws-us3.pusher.com` to `connect-src`. **Production and local get none of this**
— the enforced production policy stays tight. This means preview-deployment consoles
will legitimately show toolbar-related entries only if the toolbar is disabled; they
are not production concerns.

## Before flipping: read the Report-Only violation reports

There is **no report endpoint** wired up (no `report-uri`/`report-to`). Violations
surface in the **browser DevTools console** as:

> `Refused to load … because it violates the following Content Security Policy directive: "…". This is a report-only policy, so nothing was blocked.`

Exercise the whole app in a Report-Only build (staging / a preview deploy) with the
console open and confirm **zero** violations across these flows — each touches a part
of the policy:

1. **Login** → Google sign-in redirect and back (Supabase auth; `connect-src`, redirects).
2. **Dashboard first paint** → theme bootstrap inline script runs (`script-src 'unsafe-inline'`).
3. **Time Tracker** → open the day-logger modal, trigger the "share card" export
   (html-to-image → `img-src blob:`/`data:`, `worker-src blob:`).
4. **Mail composer / Mail tracking** → generate + send; open recipient/click views
   (tracking pixels, Supabase Storage signed URLs on `img-src`).
5. **Team Chat** → send a message and an attachment; watch Realtime update live
   (`connect-src` Supabase `wss://`, Storage image on `img-src`).
6. **Settings & Admin** → all panels load (multiple fetches to `'self'`).

For each console violation, decide: is it a **legit origin we forgot** (add it to the
matching directive in `next.config.ts`) or **something to remove** (e.g. an accidental
external asset)? Re-verify after any policy edit — still Report-Only — until the
console is clean. Ignore entries that only appear on *preview* deployments and point
at `vercel.live`/`pusher` (that's the toolbar; see above).

Tip: filter the console to the CSP text, and check both a **desktop** and a
**mobile-viewport** session — the mobile-only responsive panels can pull different
assets.

## Flip to enforce (exact Vercel steps)

Do this only after a Report-Only staging/preview run shows a clean console.

1. Vercel Dashboard → the project → **Settings → Environment Variables**.
2. **Add** variable:
   - **Key**: `CSP_ENFORCE`
   - **Value**: `1`
   - **Environments**: tick **Production** (add **Preview** too only once preview
     runs are also clean; leaving Preview unticked keeps preview in Report-Only,
     which is handy while iterating). Leave **Development** unticked.
3. **Save.** Env-var changes are **not** applied to existing deployments — trigger a
   new one: **Deployments → latest production deployment → ⋯ → Redeploy** (or push a
   commit / merge to the production branch).
4. Verify on the live site: DevTools → **Network** → the document request →
   **Response Headers** shows **`content-security-policy`** (no longer
   `content-security-policy-report-only`). Re-walk the flows above; any real
   violation now **blocks** (broken image / dead fetch / silent script) instead of
   just logging.

## Rollback

Set `CSP_ENFORCE` to `0` (or delete the variable) in the same Settings screen and
redeploy. The header reverts to `Content-Security-Policy-Report-Only` and nothing is
blocked while you fix the offending directive in `next.config.ts`.
