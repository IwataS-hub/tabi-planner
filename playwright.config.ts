import { defineConfig, devices } from '@playwright/test';

// E2E config. Playwright boots the Vite dev server itself, so `npm run
// test:e2e` works from a clean checkout (after `npx playwright install`).
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // A non-real, placeholder key so the search/reverse-geocoding UI is enabled
    // during E2E. Every Geoapify request is intercepted by `page.route`, so the
    // key never leaves the browser and no real network call is made. Process env
    // takes precedence over .env.local in Vite, so this also keeps runs
    // deterministic on machines that have a real dev key configured.
    env: { VITE_GEOAPIFY_API_KEY: 'e2e-test-key' },
  },
});
