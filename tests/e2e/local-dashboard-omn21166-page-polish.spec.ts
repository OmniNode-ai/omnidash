import { expect, test } from 'playwright/test';
import { chartRows, prefix, revealRunFields, serveCharts } from './omn21166-chart-fixtures';

// Visual failures found in main Chrome: split header words, narrow identity values,
// inconsistent advanced-page titles and horizontally overflowing pipeline stages.
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', trace: 'on' });
test.beforeEach(async ({ page }) => { await serveCharts(page); });

test('Runs retains all eighteen columns without splitting header words', async ({ page }, info) => {
  await page.goto('/runs');
  await revealRunFields(page);
  const headers = page.locator('[data-component="recent-runs"] .local-dashboard-table-wrap--fit th');
  await expect(headers).toHaveCount(18);
  const splitWords = await headers.evaluateAll(elements => elements.flatMap(element => {
    // OMN-21166 AC75: a sortable header's text sits inside its sort button, so the first text node is looked for inside.
    const text = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, { acceptNode: node => (node.textContent ?? '').trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP }).nextNode();
    if (!text) throw new Error('Header text control missing');
    return [...(text.textContent ?? '').matchAll(/\S+/g)].flatMap(match => {
      const range = document.createRange();
      range.setStart(text, match.index!);
      range.setEnd(text, match.index! + match[0].length);
      return range.getClientRects().length > 1 ? [match[0]] : [];
    });
  }));
  expect(splitWords).toEqual([]);
  expect(await page.locator('[data-component="recent-runs"] .local-dashboard-table-wrap--fit').evaluate(el => el.scrollWidth - el.clientWidth)).toBe(0);
  await page.screenshot({ path: info.outputPath('runs-readable-headers.png'), fullPage: true });
});

test('local identity values use available width instead of narrow metric columns', async ({ page }, info) => {
  // OMN-21166 part 11: the tenant is read from the native local-runtime row of local-environment.v1, so serve that row.
  await serveCharts(page, { ...chartRows, [prefix + 'local-environment.v1']: [
    { mode: 'native', service: 'local-runtime', tenant_id: 'chart-fixture-tenant', updated_at: '2026-10-17T10:00:00Z' }] });
  await page.goto('/api-keys');
  const values = page.locator('.local-dashboard-fields dd');
  await expect(values.first()).toBeVisible();
  expect(await values.first().evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThanOrEqual(320);
  await expect(page.getByText('Tenant', { exact: true })).toBeVisible();
  await expect(page.getByText('Minted', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('identity-readable.png') });
});

test('Runs status labels stay whole inside their pills', async ({ page }) => {
  await page.goto('/runs');
  const pills = page.locator('[data-component="recent-runs"] .local-dashboard-table-wrap--fit .local-run-pill');
  await expect(pills.first()).toBeVisible();
  expect(await pills.evaluateAll(elements => elements.filter(element => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return range.getClientRects().length > 1;
  }).length)).toBe(0);
});

for (const route of ['delegation-evidence', 'experiments', 'agent-workbench', 'event-bus', 'lab']) {
  test(`${route} uses the shared desktop title scale and compact surfaces`, async ({ page }, info) => {
    await page.goto('/' + route);
    // The lazy-route placeholder also has an h1; inspect the loaded page shell.
    const title = page.locator('.ev-root .ev-title');
    await expect(title).toBeVisible();
    // OMN-21166 seven-page look: Delegation Evidence is one of the seven pages and carries the compact page head
    // (20px title, 24px side padding, at every width); the other advanced pages keep the 30/36 desktop and 24 phone scale.
    const compact = route === 'delegation-evidence';
    expect(await title.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBe(compact ? 20 : 30);
    expect(await page.locator('.ev-page-head').evaluate(el => parseFloat(getComputedStyle(el).paddingLeft))).toBe(compact ? 24 : 36);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await title.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBe(compact ? 20 : 24);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath(`${route}-narrow.png`), fullPage: true });
  });
}

test('Workbench pipeline keeps all six stage topics readable without sideways scrolling', async ({ page }, info) => {
  await page.goto('/agent-workbench');
  const pipeline = page.locator('.pipe');
  await expect(pipeline.locator('.pstage')).toHaveCount(6);
  expect(await pipeline.evaluate(el => el.scrollWidth - el.clientWidth)).toBe(0);
  const topics = pipeline.locator('.tp');
  await expect(topics).toHaveCount(6);
  expect(await topics.evaluateAll(elements => elements.filter(el => el.scrollWidth > el.clientWidth + 1).length)).toBe(0);
  await page.screenshot({ path: info.outputPath('workbench-readable-pipeline.png') });
});
