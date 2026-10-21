import { expect, test } from 'playwright/test';
import { chartRows, prefix, runIds, serveCharts } from './omn21166-chart-fixtures';

// Before implementation: catch wrong source/identity, zero replaced by missing,
// absent/malformed data rendered as zero, stale filter/page selection, overflow,
// inaccessible exact values, unequal card rows and ignored reduced motion.
const decisions = prefix + 'delegation.decisions.v1';
const savings = prefix + 'delegation.savings.v1';
const rows = {
  ...chartRows,
  [decisions]: chartRows[decisions].map((row, i) => ({ ...(row as object),
    cost_usd: ['0.012345', '0', null][i], actual_score: ['0.987654', 0, null][i],
  })),
  [savings]: [{ sessions: [{ session_id: runIds[0], local_cost_usd: '0.001234' }] }],
};
test.use({ viewport: { width: 1440, height: 900 }, trace: 'on' });

test('cost and score show precise served values, zero and unknown, and open exact runs', async ({ page }, info) => {
  await serveCharts(page, rows);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/runs');
  const cost = page.getByRole('figure', { name: 'Local cost per run', exact: true });
  const score = page.getByRole('figure', { name: 'Quality score per run', exact: true });
  for (const chart of [cost, score]) await expect(chart.locator('.local-chart-canvas svg')).toBeVisible();
  await cost.getByLabel('Inspect run').selectOption(runIds[0]);
  await expect(cost.getByRole('status')).toContainText('$0.001234'); // session cost wins over decision
  await score.getByLabel('Inspect run').selectOption(runIds[0]);
  await expect(score.getByRole('status')).toContainText('0.987654');
  await expect(score.getByRole('link', { name: 'Open run', exact: true })).toHaveAttribute('href', /chart-run-a/);
  for (const chart of [cost, score]) {
    await chart.getByLabel('Inspect run').selectOption(runIds[1]);
    await expect(chart.getByRole('status')).toContainText(chart === cost ? '$0' : 'Score: 0');
    await chart.getByLabel('Inspect run').selectOption(runIds[2]);
    await expect(chart.getByRole('status')).toContainText('Not recorded');
  }
  await cost.getByLabel('Inspect run').selectOption(runIds[1]);
  await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('passed');
  await expect(cost.getByLabel('Inspect run')).toHaveValue('');
  await expect(cost.getByLabel('Inspect run').locator('option')).toHaveCount(3);
  await score.getByLabel('Inspect run').selectOption(runIds[0]);
  // Read and activate the actual painted score bar, not chart-library state.
  await score.scrollIntoViewIfNeeded();
  const color = await score.locator('.local-chart-symbol').evaluate(el => getComputedStyle(el).color);
  const painted = await score.locator('.local-chart-canvas svg path').evaluateAll((els, color) => els.filter(el => {
    const b=el.getBoundingClientRect(); return getComputedStyle(el).fill === color && b.width > 3 && b.height > 3;
  }).map(el => { const b=el.getBoundingClientRect(); return { x:b.x+b.width/2, y:b.y+b.height/2 }; }), color);
  expect(painted).toHaveLength(1);
  await page.mouse.move(painted[0].x, painted[0].y);
  await expect(score.locator('.local-chart-canvas')).toContainText('Score: 0.987654');
  await page.mouse.click(painted[0].x, painted[0].y);
  await expect(page).toHaveURL(/workflow\?correlation_id=chart-run-a/);
  await page.screenshot({ path: info.outputPath('metric-run-workflow.png') });
});

test('missing and malformed metric values remain explicit instead of zero charts', async ({ page }, info) => {
  await serveCharts(page, { ...rows, [savings]: [], [decisions]: rows[decisions].map(row => ({ ...row, cost_usd: null, actual_score: [] })) });
  await page.goto('/runs');
  for (const name of ['Local cost per run', 'Quality score per run']) {
    const chart = page.getByRole('figure', { name, exact: true });
    await expect(chart).toContainText('No recorded values for these runs');
    await expect(chart.locator('.local-chart-canvas')).toHaveCount(0);
    await chart.getByLabel('Inspect run').selectOption(runIds[0]);
    await expect(chart.getByRole('status')).toContainText('Not recorded');
  }
  await page.screenshot({ path: info.outputPath('metrics-unrecorded.png') });
});

test('metrics follow pagination and keep compact equal cards in both themes and phone widths', async ({ page }, info) => {
  const many = Array.from({ length: 26 }, (_, i) => ({ ...rows[decisions][0], correlation_id: `metric-${i}`, created_at: new Date(Date.UTC(2026, 9, 17, 10, 0, 26-i)).toISOString() }));
  await serveCharts(page, { ...rows, [decisions]: many });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/runs');
  const cost = page.getByRole('figure', { name: 'Local cost per run', exact: true });
  await expect(cost).toHaveAttribute('data-motion', 'reduced');
  await cost.getByLabel('Inspect run').selectOption('metric-0');
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(cost.getByLabel('Inspect run')).toHaveValue('');
  await expect(cost.getByLabel('Inspect run').locator('option')).toHaveCount(2);
  await expect(cost.getByLabel('First point')).toHaveCount(0);
  await expect(cost.getByLabel('Inspect run').locator('option').last()).toHaveAttribute('value', 'metric-25');
  const heights = await page.locator('.local-run-charts > figure').evaluateAll(els => els.map(el => el.getBoundingClientRect().height));
  expect(Math.abs(heights[2] - heights[3])).toBeLessThan(2);
  for (const width of [1440, 390, 320]) {
    if (width === 390) await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['dark', 'light']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.getByRole('button', { name: 'Toggle theme' }).click();
      await expect(cost).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await cost.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath(`runs-metrics-${width}-${theme}.png`) });
    }
  }
});

test('measured zero cost has a visible explanation and keeps missing costs separate', async ({ page }) => {
  await serveCharts(page, { ...rows, [savings]: [], [decisions]: rows[decisions].map((row, i) => ({ ...row, cost_usd: i === 2 ? null : 0 })) });
  await page.goto('/runs');
  const chart = page.getByRole('figure', { name: 'Local cost per run', exact: true });
  await expect(chart).toContainText('2 of 3 recorded');
  await expect(chart).toContainText('Recorded costs are $0');
  await expect(chart).toContainText('1 not recorded');
});
