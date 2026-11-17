// OMN-24616 AC6 (falsifier): one formatter set over the six pages. Fails on a second spelling of a missing value, a
// page without an Updated time, or a share written with a precision other than one decimal.
// "Not recorded" stays allowed: it is the label of a run's status and failure cause (quality never evaluated, no
// cause recorded), a value a filter offers, not a missing figure.
import { expect, test } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });

const PAGES = ['/overview', '/runs', '/workflow', '/usage', '/settings', '/delegation-evidence'];
const OTHER_SPELLINGS = /\b(Not served|Unavailable|Not available)\b/;
// A percent with no decimal, or with two or more, outside "<0.1%".
const OTHER_PRECISION = /(?<![\d.<])\d+%|\d+\.\d{2,}%/;

for (const path of PAGES) {
  test(`${path} writes a missing value one way, shows its Updated time, and one precision per share`, async ({ page }) => {
    await serveCharts(page);
    await page.goto(path);
    await expect(page.getByText(/^Updated /)).toBeVisible();
    await expect(page.getByText('Loading data…')).toHaveCount(0);
    const text = await page.locator('main').innerText();
    expect(text.match(OTHER_SPELLINGS)?.[0] ?? null).toBeNull();
    expect(text.match(OTHER_PRECISION)?.[0] ?? null).toBeNull();
  });
}

// Review 518 finding 3: a figure the runtime did not serve reads Not measured wherever a figure is drawn -- the metric
// tiles and the numeric table cells -- never "Not recorded" or a dash. Runs with no duration, verdict, cost, tokens or
// escalation count make every such figure missing; the positive control proves the check sees them.
const figureless = (chartRows[prefix + 'delegation.decisions.v1'] as Record<string, unknown>[]).map(row => ({
  correlation_id: row.correlation_id, created_at: row.created_at, written_at: row.written_at, model_name: row.model_name,
  task_type: row.task_type, data_source: row.data_source,
}));
for (const path of ['/overview', '/runs']) {
  test(`${path} writes a missing figure as Not measured in every tile and numeric cell`, async ({ page }) => {
    await serveCharts(page, { ...chartRows, [prefix + 'delegation.decisions.v1']: figureless });
    await page.goto(path);
    await expect(page.getByText(/^Updated /)).toBeVisible();
    const figures = (await page.locator('.local-dashboard-metric, td[data-num]').allInnerTexts()).map(text => text.trim());
    expect(figures.some(text => text.startsWith('Not measured')), 'positive control').toBe(true);
    expect(figures.filter(text => /^(Not recorded|—)$/.test(text))).toEqual([]);
  });
}

// The run detail of chart-run-c, served with no duration and no tokens out: every timing and token figure, the token
// flow under the tiles included, reads Not measured.
test('a run detail writes its missing timings and tokens as Not measured, in the tiles and the token flow', async ({ page }) => {
  await serveCharts(page);
  await page.goto('/workflow?correlation_id=chart-run-c');
  await expect(page.getByText(/^Updated /)).toBeVisible();
  const region = page.getByRole('region', { name: 'Run summary' });
  await expect(region).toBeVisible();
  const text = await region.innerText();
  expect(text, 'positive control').toContain('Not measured');
  expect(text.match(/Not recorded/g) ?? []).toEqual([]);
});
