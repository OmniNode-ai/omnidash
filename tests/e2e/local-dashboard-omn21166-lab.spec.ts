import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from 'playwright/test';

// AC12 failure modes written before the formatter edit: null rate crashes
// toFixed; null/missing counts crash toLocaleString; unmeasured values become
// invented zero; measured zero disappears; filtering/sorting/navigation break.
// This faithful projection fixture is not evidence of a live producer write.
const topic = 'onex.snapshot.projection.topic-activity.v1';
const numericRow = {
  topic: 'onex.evt.fixture.numeric.v1', sampled_at: '2026-10-17T10:00:00Z',
  high_watermark_total: 1234, low_watermark_total: 0, retained_messages: 1234,
  messages_since_previous_sample: 0, rate_per_second: 0, messages_last_hour: 12,
  messages_last_24h: 1234, rate_last_hour_per_second: 0, retention_truncated: false,
  newest_message_at: null, newest_message_age_seconds_at_sample: null,
  activity_state: 'UNKNOWN', projection_cursor: 'fixture',
};
async function serve(page: Page, rows: unknown[]) {
  await page.addInitScript(() => {
    localStorage.setItem('omnidash.dataSourceOverride.v1', JSON.stringify({ mode: 'live', baseUrl: location.origin }));
  });
  await page.route('**/projections', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
    topics: [{ topic, backing: 'bus', bus_backed: true, status: 'ok', tenant_scoped: false }],
  }) }));
  await page.route('**/projection/**', route => {
    const requested = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-1) ?? '');
    const selected = requested === topic ? rows : [];
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      rows: selected, row_count: selected.length, data_freshness: 'unknown', latest_event_at: null,
    }) });
  });
}
test.use({ viewport: { width: 1440, height: 900 }, trace: 'on' });

test('AC12 positive control: measured zero and positive counts remain exact', async ({ page }, info) => {
  await serve(page, [numericRow]);
  await page.goto('/lab');
  const row = page.getByTestId('topic-activity-row');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('0.00');
  await expect(row).toContainText('1,234');
  await expect(row).not.toContainText('Not measured');
  await page.screenshot({ path: info.outputPath('lab-numeric-control.png') });
});

for (const field of ['rate_per_second', 'messages_last_hour', 'messages_last_24h', 'retained_messages']) {
  test(`AC12 null ${field} is explicit and never blanks Lab`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await serve(page, [{ ...numericRow, [field]: null }, { ...numericRow, topic: 'onex.evt.fixture.second.v1', rate_per_second: 1.25 }]);
    await page.goto('/lab');
    const rows = page.getByTestId('topic-activity-row');
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: numericRow.topic })).toContainText('Not measured');
    await expect(rows.filter({ hasText: 'onex.evt.fixture.second.v1' })).toContainText('1.25');
    await page.getByRole('button', { name: 'Sort by Rate/s', exact: true }).click();
    await page.getByRole('textbox', { name: 'Filter topic activity by suffix', exact: true }).fill('numeric.v1');
    await expect(rows).toHaveCount(1);
    expect(errors).toEqual([]);
    await page.screenshot({ path: info.outputPath(`lab-${field}-unmeasured.png`) });
    await page.getByTestId('nav-local-overview').click();
    await expect(page.locator('.breadcrumbs .cur')).toHaveText('Overview');
    writeFileSync(info.outputPath('receipt.json'), JSON.stringify({ field, data: 'governed projection fixture', errors, navigation: 'Overview reachable' }));
  });
}

test('AC12 omitted and invalid numeric values never masquerade as measured zero', async ({ page }) => {
  const { rate_per_second: omittedRate, ...missing } = numericRow;
  void omittedRate;
  await serve(page, [missing, { ...numericRow, topic: 'onex.evt.fixture.invalid.v1', rate_per_second: 'NaN',
    retained_messages: null, messages_last_hour: null, messages_last_24h: null }]);
  await page.goto('/lab');
  const rows = page.getByTestId('topic-activity-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: numericRow.topic })).toContainText('Not measured');
  await expect(rows.filter({ hasText: 'onex.evt.fixture.invalid.v1' }).getByText('Not measured', { exact: true })).toHaveCount(4);
});

test('Lab explains an unmatched suffix and clears it without losing served rows', async ({ page }, info) => {
  await serve(page, [numericRow, { ...numericRow, topic: 'onex.evt.fixture.second.v1', rate_per_second: null }]);
  await page.goto('/lab');
  const rows = page.getByTestId('topic-activity-row');
  await expect(rows).toHaveCount(2);
  const before = await rows.allTextContents();
  await page.getByLabel('Filter topic activity by suffix').fill('no-such-topic');
  await expect(rows).toHaveCount(0);
  const feedback = page.getByRole('status').filter({ hasText: 'No topics match this suffix.' });
  await expect(feedback).toBeVisible();
  await expect(page.getByText('No topic activity samples', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('lab-unmatched-suffix.png') });
  await feedback.getByRole('button', { name: 'Clear suffix filter', exact: true }).press('Enter');
  await expect(page.getByLabel('Filter topic activity by suffix')).toHaveValue('');
  await expect(page.getByLabel('Filter topic activity by suffix')).toBeFocused();
  await expect(rows).toHaveCount(2);
  expect(await rows.allTextContents()).toEqual(before);
  await expect(feedback).toHaveCount(0);
  await expect(rows.filter({ hasText: numericRow.topic })).toContainText('0.00');
  await expect(rows.filter({ hasText: 'second.v1' })).toContainText('Not measured');
  await page.screenshot({ path: info.outputPath('lab-cleared-suffix.png') });
});
