import { defineConfig, devices } from 'playwright/test';

const storybookPort = process.env.EXECUTION_GRAPH_STORYBOOK_PORT ?? '6007';
if (!/^\d{4,5}$/.test(storybookPort) || Number(storybookPort) > 65535) {
  throw new Error('EXECUTION_GRAPH_STORYBOOK_PORT must be a valid local port');
}

export default defineConfig({
  testDir: './tests/execution-graph-e2e',
  fullyParallel: false,
  reporter: 'line',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${storybookPort}`,
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npx storybook dev --port ${storybookPort} --no-open`,
    url: `http://localhost:${storybookPort}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
