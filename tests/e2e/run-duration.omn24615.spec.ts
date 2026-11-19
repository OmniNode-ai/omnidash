import { expect, test } from 'playwright/test';
import { chartRows, serveCharts } from './omn21166-chart-fixtures';

// OMN-24615 AC8: Runs and the run detail show one run duration, the served execution_ms (the whole run), never the
// model call time (latency_ms). The run's two timings differ here, so a page that shows the model call fails.
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });

const DECISIONS = 'onex.snapshot.projection.delegation.decisions.v1';
const rows = {
  ...chartRows,
  [DECISIONS]: (chartRows[DECISIONS] as Record<string, unknown>[])
    .map(row => row.correlation_id === 'chart-run-a' ? { ...row, execution_ms: 4788, latency_ms: 743 } : row),
};

test('Runs and the run detail show the same run duration, the whole run', async ({ page }) => {
  await serveCharts(page, rows);
  await page.goto('/runs');
  const listed = page.getByRole('row', { name: /chart-run-a/ }).locator('td[data-label="Duration"]');
  await expect(listed).toHaveText('4.8 s');

  await page.goto('/workflow?correlation_id=chart-run-a');
  const summary = page.locator('.local-dashboard-run-summary');
  await expect(summary.locator('[data-summary-field="Duration"] dd')).toHaveText('4.8 s');
  await expect(summary.locator('[data-summary-field="Model call time"] dd')).toHaveText('743 ms');
});
