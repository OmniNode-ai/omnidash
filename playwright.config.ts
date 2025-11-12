import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration for Snapshot Testing
 *
 * This configuration is optimized for visual regression testing of the Omnidash dashboards.
 * It includes multiple viewport sizes and browser configurations to ensure consistency
 * across different screen sizes and devices.
 */
export default defineConfig({
  // Test directory for snapshot tests
  testDir: './client/src/tests/snapshots',

  // Maximum time one test can run
  timeout: 30 * 1000,

  // Expect timeout for assertions
  expect: {
    // Maximum time expect() should wait for the condition to be met
    timeout: 5000,

    // Snapshot comparison configuration
    toHaveScreenshot: {
      // Maximum pixel difference ratio between snapshots
      maxDiffPixelRatio: 0.01,
      // Threshold for individual pixel comparison (0-1)
      threshold: 0.2,
      // Number of different pixels allowed
      maxDiffPixels: 100,
    },
  },

  // Run tests in files in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Opt out of parallel tests on CI (for more stable screenshots)
  workers: process.env.CI ? 1 : undefined,

  // Reporter to use
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
    ...(process.env.CI ? [['github'] as const] : []),
  ],

  // Shared settings for all projects
  use: {
    // Base URL for navigation
    baseURL: 'http://localhost:3000',

    // Collect trace when retrying the failed test
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video on failure
    video: 'retain-on-failure',
  },

  // Configure projects for major browsers and viewports
  projects: [
    {
      name: 'chromium-desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
      },
    },
    {
      name: 'chromium-laptop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1366, height: 768 },
      },
    },
    {
      name: 'chromium-tablet',
      use: {
        ...devices['iPad Pro'],
      },
    },
    {
      name: 'chromium-mobile',
      use: {
        ...devices['iPhone 12'],
      },
    },
  ],

  // Run your local dev server before starting the tests
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
