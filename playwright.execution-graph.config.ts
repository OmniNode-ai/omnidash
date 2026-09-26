import { defineConfig, devices } from 'playwright/test';

export default defineConfig({
  testDir: './tests/execution-graph-e2e',
  fullyParallel: false,
  reporter: 'line',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:6007',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npx storybook dev --port 6007 --no-open',
    url: 'http://localhost:6007',
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
