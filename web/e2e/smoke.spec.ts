import { expect, test } from "@playwright/test";

// Auth is Google-OAuth-only (flyability.com), so the smoke suite covers the
// unauthenticated surface. Authed flows need a seeded Supabase storage state —
// tracked as a masterplan follow-up.

test("root redirects signed-out visitors to /login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

test("login page renders the Google sign-in card", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: /continue with google/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
});

test("dashboard is not reachable signed out", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("public app-meta endpoint responds", async ({ request }) => {
  const response = await request.get("/api/app-meta");
  expect(response.ok()).toBe(true);
  const body = await response.json();
  expect(typeof body).toBe("object");
});
