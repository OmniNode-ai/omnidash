import { defineConfig, devices } from 'playwright/test';
import { existsSync } from 'node:fs';

// Hosted Ubuntu runners already supply Chromium. Reuse it so verification
// checks spend their budget on browser assertions, not browser downloads.
const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);

// OMN-10305: Playwright E2E config for cost-trend cluster proof-of-life.
// Runs against the Vite dev server on port 5174.
// CI uses fixtures/ directory fixtures served via the Vite /_fixtures middleware.
export default defineConfig({
  testDir: './tests',
  testMatch: ['**/*.spec.ts'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['html', { open: 'never' }], ['line']],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5174',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // OMN-21970 AC9 animates figures and bars on load. Measured on .201 (2026-11-03, Playwright 1.59.1): a spec's
    // test.use({ reducedMotion }) did not reach the page (matchMedia reported false and figures were read mid count-up),
    // while this context option does. Specs that check motion switch it on with page.emulateMedia({ reducedMotion:
    // 'no-preference' }), as the Workflow analysis spec does.
    contextOptions: { reducedMotion: 'reduce' },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(chromiumExecutable
          ? { launchOptions: { executablePath: chromiumExecutable } }
          : {}),
      },
    },
  ],
  webServer: {
    command: 'VITE_DATA_SOURCE=file npm run dev -- --port 5174',
    url: 'http://localhost:5174',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
