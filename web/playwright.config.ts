import { defineConfig } from "@playwright/test";

/**
 * E2E smoke suite. Needs a runnable app: `web/.env.local` must contain at least
 * NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY. First run:
 * `npx playwright install chromium`, then `npm run test:e2e`.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
