import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for end-to-end tests.
 *
 * Run against a locally running dev server:
 *   bun run dev            # separate terminal, serves at http://localhost:8080
 *   bun run test:e2e
 *
 * Authenticated tests expect a Supabase session to be injected via env vars
 * (LOVABLE_BROWSER_SUPABASE_STORAGE_KEY, LOVABLE_BROWSER_SUPABASE_SESSION_JSON,
 *  LOVABLE_BROWSER_SUPABASE_COOKIES_JSON). When those are absent the tests
 * that require an authenticated session are skipped, so the suite is safe to
 * run in unauthenticated environments.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:8080",
    viewport: { width: 1280, height: 1800 },
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});