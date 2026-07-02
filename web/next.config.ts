import type { NextConfig } from "next";

// --- Security headers (SECURITY.md T1.1) ---
//
// The CSP is shipped Report-Only first so it cannot break production: violations
// show up in the browser console (and any report endpoint) without blocking. Flip
// CSP_ENFORCE to true after verifying there are no violations in staging.
const CSP_ENFORCE = process.env.CSP_ENFORCE === "1";

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

const csp = [
  `default-src 'self'`,
  `base-uri 'self'`,
  `object-src 'none'`,
  `frame-ancestors 'none'`,
  `form-action 'self'`,
  // Next injects inline bootstrap scripts; without a nonce pipeline we allow
  // inline scripts. No 'unsafe-eval' — production bundles don't need it.
  `script-src 'self' 'unsafe-inline'`,
  // Tailwind and framer-motion set inline styles.
  `style-src 'self' 'unsafe-inline'`,
  // Mail-tracking pixels, Supabase Storage signed URLs, and data/blob QR images.
  `img-src 'self' data: blob: https:`,
  `font-src 'self' data:`,
  `connect-src ${["'self'", supabaseHttp, supabaseWss].filter(Boolean).join(" ")}`,
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
