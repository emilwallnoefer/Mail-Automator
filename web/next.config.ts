import type { NextConfig } from "next";

// NOTE: the CSP is deliberately NOT here any more.
//
// `headers()` can only emit static values, and a static policy cannot carry a
// per-request nonce — which is why `script-src` was stuck with 'unsafe-inline',
// allowing any injected inline <script>. The policy now lives in
// `src/lib/security/csp.ts` and is emitted per request from `src/proxy.ts`,
// which is what let 'unsafe-inline' go. Do not re-add it here: two CSP headers
// are intersected by the browser and the interaction is easy to get wrong.
const securityHeaders = [
  // `preload` makes the domain eligible for the browser-baked HSTS preload list
  // (submit at hstspreload.org). Only meaningful once every subdomain is
  // HTTPS-only — which is the case here; the app is Vercel-hosted and Supabase
  // is a separate domain.
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
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
