import { writeFileSync } from 'node:fs';
import { expect, test } from 'playwright/test';
import { chartRows, prefix, runIds, serveCharts } from './omn21166-chart-fixtures';

// Failure modes: Usage range/reset is disconnected; paging/refresh substitutes
// another run at the same index; missing ids become navigable; touch disclosure
// loses its expanded state; Workflow repeats a generic icon or loses attempts.
// These fixtures exercise the UI contract and do not certify a live runtime.
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', trace: 'on' });

test('Usage zoom and reset preserve the selected day and exact served table', async ({ page }, info) => {
  await serveCharts(page);
  await page.goto('/usage');
  const panel = page.locator('[data-component="usage-savings-series"]');
  const chart = panel.getByRole('figure', { name: 'Savings per day vs baseline-a', exact: true });
  await expect(chart.locator('.local-chart-canvas svg')).toBeVisible();
  // OMN-21166 part 13: the savings day table is under "Savings by day as a table".
  await panel.getByText('Savings by day as a table', { exact: true }).press('Enter');
  const before = await panel.getByRole('table').innerText();
  await chart.getByLabel('Inspect day', { exact: true }).selectOption('1');
  await expect(chart.getByRole('status')).toContainText('2026-10-02');
  await expect(chart.getByRole('status')).toContainText(/Savings: \$0\.03$/);
  await chart.getByLabel('First point', { exact: true }).press('ArrowRight');
  await expect(chart.getByText('Showing 2–3 of 3', { exact: true })).toBeVisible();
  await chart.getByRole('button', { name: 'Reset view', exact: true }).click();
  await expect(chart.getByText('Showing 1–3 of 3', { exact: true })).toBeVisible();
  await expect(chart.getByLabel('Inspect day', { exact: true })).toHaveValue('1');
  expect(await panel.getByRole('table').innerText()).toBe(before);
  await page.screenshot({ path: info.outputPath('usage-reset.png'), fullPage: true });
  writeFileSync(info.outputPath('receipt.json'), JSON.stringify({ selectedDay: '2026-10-02', tableBefore: before, tableAfter: await panel.getByRole('table').innerText() }, null, 2));
});

test('a refresh inserting a newer run preserves the selected full run id', async ({ page }, info) => {
  const topic = prefix + 'delegation.decisions.v1';
  const decisions = chartRows[topic].map(row => ({ ...row as Record<string, unknown> }));
  await serveCharts(page, { ...chartRows, [topic]: decisions });
  await page.goto('/runs');
  // OMN-21166 part 13: the run charts sit under the closed "More run charts" on Runs; open it first.
  await page.getByText('More run charts', { exact: true }).press('Enter');
  const chart = page.getByRole('figure', { name: 'Duration per run', exact: true });
  const selector = chart.getByLabel('Inspect run', { exact: true });
  await selector.selectOption(runIds[1]);
  await expect(chart.getByRole('link', { name: 'Open run', exact: true })).toHaveAttribute('href', /correlation_id=chart-run-b$/);
  decisions.unshift({ ...decisions[0], correlation_id: 'newer-run', created_at: '2026-10-18T10:00:00Z', written_at: '2026-10-18T10:00:00Z' });
  const response = page.waitForResponse(r => r.url().includes(encodeURIComponent(topic)) || r.url().includes('/' + topic));
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await response;
  await expect(selector.getByRole('option', { name: /newer-run/ })).toHaveCount(1);
  await expect(selector).toHaveValue(runIds[1]);
  await expect(chart.getByRole('link', { name: 'Open run', exact: true })).toHaveAttribute('href', /correlation_id=chart-run-b$/);
  await page.screenshot({ path: info.outputPath('inserted-refresh-identity.png'), fullPage: true });
});

test('filtering the selected run off the chart clears it without selecting another run', async ({ page }, info) => {
  await serveCharts(page);
  await page.goto('/runs');
  // OMN-21166 part 13: the run charts sit under the closed "More run charts" on Runs; open it first.
  await page.getByText('More run charts', { exact: true }).press('Enter');
  const chart = page.getByRole('figure', { name: 'Duration per run', exact: true });
  const selector = chart.getByLabel('Inspect run', { exact: true });
  await selector.selectOption(runIds[1]);
  await expect(chart.getByRole('link', { name: 'Open run', exact: true })).toHaveAttribute('href', /correlation_id=chart-run-b$/);
  await page.getByLabel('Model', { exact: true }).selectOption('model-a');
  await expect(selector.getByRole('option')).toHaveCount(3);
  await expect(selector).toHaveValue('');
  await expect(chart.getByRole('link', { name: 'Open run', exact: true })).toHaveCount(0);
  await expect(chart.locator('.local-chart-detail')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('filtered-selection-cleared.png'), fullPage: true });
});

test('chart run identity stays exact after pagination removes the selection', async ({ page }, info) => {
  const decisionsTopic = prefix + 'delegation.decisions.v1';
  const many = Array.from({ length: 27 }, (_, index) => ({
    ...(chartRows[decisionsTopic][0] as object), correlation_id: `paged-run-${index}`,
    created_at: new Date(Date.UTC(2026, 9, 17, 10, 30 - index)).toISOString(),
    written_at: new Date(Date.UTC(2026, 9, 17, 10, 30 - index)).toISOString(),
  }));
  const served = { ...chartRows, [decisionsTopic]: many };
  await serveCharts(page, served);
  await page.goto('/runs');
  // OMN-21166 part 13: the run charts sit under the closed "More run charts" on Runs; open it first.
  await page.getByText('More run charts', { exact: true }).press('Enter');
  const chart = page.getByRole('figure', { name: 'Duration per run', exact: true });
  await chart.getByLabel('Inspect run', { exact: true }).selectOption('paged-run-1');
  await expect(chart.getByRole('link', { name: 'Open run', exact: true })).toHaveAttribute('href', /correlation_id=paged-run-1$/);
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  // An off-page run must never silently turn into that page's row at the same index.
  await expect(chart.getByLabel('Inspect run', { exact: true })).toHaveValue('');
  await expect(chart.getByRole('link', { name: 'Open run', exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('paged-selection-cleared.png'), fullPage: true });
});

test('a reordered refresh never substitutes another id for the selected run', async ({ page }, info) => {
  const topic = prefix + 'delegation.decisions.v1';
  const decisions = chartRows[topic].map(row => ({ ...row as Record<string, unknown> }));
  await serveCharts(page, { ...chartRows, [topic]: decisions });
  await page.goto('/runs');
  // OMN-21166 part 13: the run charts sit under the closed "More run charts" on Runs; open it first.
  await page.getByText('More run charts', { exact: true }).press('Enter');
  const chart = page.getByRole('figure', { name: 'Duration per run', exact: true });
  await chart.getByLabel('Inspect run', { exact: true }).selectOption(runIds[1]);
  await expect(chart.getByRole('link', { name: 'Open run', exact: true })).toHaveAttribute('href', /correlation_id=chart-run-b$/);
  [decisions[0].created_at, decisions[1].created_at] = [decisions[1].created_at, decisions[0].created_at];
  [decisions[0].written_at, decisions[1].written_at] = [decisions[1].written_at, decisions[0].written_at];
  const refreshed = page.waitForResponse(response => response.url().includes(encodeURIComponent(topic)) || response.url().includes('/' + topic));
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await refreshed;
  await expect(chart.getByLabel('Inspect run', { exact: true }).getByRole('option').nth(1)).toHaveAttribute('value', runIds[1]);
  await expect(chart.getByLabel('Inspect run', { exact: true })).toHaveValue(runIds[1]);
  await expect(chart.getByRole('link', { name: 'Open run', exact: true })).toHaveAttribute('href', /correlation_id=chart-run-b$/);
  await page.screenshot({ path: info.outputPath('reordered-refreshed-identity.png'), fullPage: true });
});

test('a run with no recorded id is absent from the chart selector and cannot replace a valid identity', async ({ page }, info) => {
  const topic = prefix + 'delegation.decisions.v1';
  const missing = { ...(chartRows[topic][0] as object), correlation_id: null };
  await serveCharts(page, { ...chartRows, [topic]: [missing, chartRows[topic][1]] });
  await page.goto('/runs');
  // OMN-21166 part 13: the run charts sit under the closed "More run charts" on Runs; open it first.
  await page.getByText('More run charts', { exact: true }).press('Enter');
  const chart = page.getByRole('figure', { name: 'Duration per run', exact: true });
  await expect(chart.locator('.local-chart-canvas svg')).toBeVisible();
  const options = chart.getByLabel('Inspect run', { exact: true }).getByRole('option');
  await expect(options).toHaveCount(2);
  expect(await options.evaluateAll(elements => elements.map(element => (element as HTMLOptionElement).value))).toEqual(['', runIds[1]]);
  await expect(chart.getByRole('link', { name: 'Open run', exact: true })).toHaveCount(0);
  await chart.getByLabel('Inspect run', { exact: true }).selectOption(runIds[1]);
  await expect(chart.getByRole('link', { name: 'Open run', exact: true })).toHaveAttribute('href', /correlation_id=chart-run-b$/);
  await page.screenshot({ path: info.outputPath('missing-id-selector.png') });
});

test.describe('touch Evidence rows', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('a real tap expands and collapses a row with aria-expanded matching its details', async ({ page }, info) => {
    await serveCharts(page);
    await page.goto('/delegation-evidence');
    const toggle = page.getByRole('button', { name: 'Toggle details for chart-run-a', exact: true });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.tap();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.row-detail')).toContainText('chart-run-a');
    await page.screenshot({ path: info.outputPath('evidence-tap-expanded.png'), fullPage: true });
    await toggle.tap();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.row-detail')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('evidence-tap-collapsed.png') });
  });
});

test('Workflow step icons identify served kinds and preserve repeated provider attempts in order', async ({ page }, info) => {
  const kinds = ['request', 'routing_decision', 'provider_call', 'provider_call', 'quality_gate', 'terminal'];
  const steps = kinds.map((step_kind, index) => ({ correlation_id: runIds[0], step_sequence: index + 1,
    step_kind, duration_ms: index, outcome: 'succeeded',
    ...(step_kind === 'provider_call' ? { attempt_number: index - 1 } : {}),
  }));
  await serveCharts(page, { ...chartRows, [prefix + 'run-trace.v1']: steps });
  await page.goto('/workflow?correlation_id=chart-run-a');
  const flow = page.getByRole('navigation', { name: 'Run steps, in the order served', exact: true });
  const links = flow.getByRole('link');
  await expect(links).toHaveCount(kinds.length);
  expect(await links.evaluateAll(elements => elements.map(element => element.getAttribute('data-step-kind')))).toEqual(kinds);
  const icons = links.locator('.local-run-node-icon svg');
  await expect(icons).toHaveCount(kinds.length);
  const classes = await icons.evaluateAll(elements => elements.map(element => element.getAttribute('class')));
  expect(new Set(classes).size).toBe(5);
  expect(classes[2]).toBe(classes[3]);
  await expect(page.locator('#run-step-3 .local-run-chips')).toContainText('attempt: 1');
  await expect(page.locator('#run-step-4 .local-run-chips')).toContainText('attempt: 2');
  await expect(page.locator('#run-step-6 .local-run-chip').filter({ hasText: 'attempt:' })).toHaveCount(0);
  await links.nth(3).click();
  await expect(page.locator('#run-step-4')).toBeInViewport();
  await page.screenshot({ path: info.outputPath('workflow-step-attempts.png'), fullPage: true });
  writeFileSync(info.outputPath('receipt.json'), JSON.stringify({ kinds, iconClasses: classes, steps }, null, 2));
});
