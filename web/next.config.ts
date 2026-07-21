import type { NextConfig } from "next";

// --- Security headers (SECURITY.md T1.1) ---
//
// The CSP is shipped Report-Only first so it cannot break production: violations
// show up in the browser console (and any report endpoint) without blocking. Flip
// CSP_ENFORCE to true after verifying there are no violations in staging.
// See web/docs/csp-enforcement.md for the review checklist and the exact Vercel
// step to enable enforcement.
const CSP_ENFORCE = process.env.CSP_ENFORCE === "1";

// Vercel injects the Live / Comments toolbar (https://vercel.live, backed by a
// Pusher websocket) into *preview* deployments only. Production never loads it, so
// we widen the policy for it exclusively off-production to keep the prod CSP tight.
// VERCEL_ENV is "production" | "preview" | "development"; undefined locally.
const IS_PREVIEW = process.env.VERCEL_ENV === "preview";

// Allow the app's own origin plus the Supabase project (REST + Realtime socket).
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
let supabaseHttp = "";
let supabaseWss = "";
try {
  if (supabaseUrl) {
    const u = new URL(supabaseUrl);
    supabaseHttp = `${u.protocol}//${u.host}`;
    supabaseWss = `wss://${u.host}`;
  }
} catch {
  // Malformed env — connect-src falls back to 'self' only.
}

// Preview-only origins for the Vercel Live toolbar. Empty in production/local so
// they never widen the enforced production policy.
const vercelLiveScript = IS_PREVIEW ? ["https://vercel.live", "'unsafe-eval'"] : [];
const vercelLiveStyle = IS_PREVIEW ? ["https://vercel.live"] : [];
const vercelLiveConnect = IS_PREVIEW ? ["https://vercel.live", "wss://ws-us3.pusher.com"] : [];
const vercelLiveFrame = IS_PREVIEW ? ["https://vercel.live"] : [];
const vercelLiveFont = IS_PREVIEW ? ["https://vercel.live", "https://assets.vercel.com"] : [];

const csp = [
  `default-src 'self'`,
  `base-uri 'self'`,
  `object-src 'none'`,
  `frame-ancestors 'none'`,
  `form-action 'self'`,
  // Next injects inline bootstrap scripts (see app/layout.tsx theme bootstrap);
  // without a nonce pipeline we allow inline scripts. No 'unsafe-eval' in prod —
  // production bundles don't need it (the Vercel Live toolbar does, preview only).
  `script-src ${["'self'", "'unsafe-inline'", ...vercelLiveScript].join(" ")}`,
  // Tailwind and framer-motion set inline styles.
  `style-src ${["'self'", "'unsafe-inline'", ...vercelLiveStyle].join(" ")}`,
  // Mail-tracking pixels, Supabase Storage signed URLs, and data/blob QR images
  // (html-to-image renders the day-log card to a blob via a data:-URI SVG).
  `img-src 'self' data: blob: https:`,
  `font-src ${["'self'", "data:", ...vercelLiveFont].join(" ")}`,
  // Supabase REST + Realtime are the only browser-side external endpoints; Gmail,
  // Google Sheets and Resend are all called server-side and need no connect-src.
  `connect-src ${["'self'", supabaseHttp, supabaseWss, ...vercelLiveConnect].filter(Boolean).join(" ")}`,
  // No app iframes; only the Vercel Live toolbar (preview) embeds one.
  `frame-src ${["'self'", ...vercelLiveFrame].join(" ")}`,
  `worker-src 'self' blob:`,
  `manifest-src 'self'`,
].join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: CSP_ENFORCE ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only",
    value: csp,
  },
];

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  async headers() {
    return [
      {
        // Apply to every route (pages, API, and the /r redirector).
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
