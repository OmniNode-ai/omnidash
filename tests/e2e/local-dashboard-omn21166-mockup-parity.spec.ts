import { expect, test } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

// RED-first AC26/27/29 regressions. The served fixtures deliberately include nulls,
// measured zero, a complete previous window, a truncated comparison, and all-unmeasured calls.
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', trace: 'on' });

const utcDay = (offset: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};
const at = (offset: number, time: string) => `${utcDay(offset)}T${time}:00Z`;

const decisions = [
  { correlation_id: 'run-before-window', created_at: at(-14, '23:59'), written_at: at(-14, '23:59'), quality_gate_passed: true, quality_gate_detail: 'completed', latency_ms: 800, cost_usd: 4, tokens_input: 40, tokens_output: 10, task_type: 'summarization', model_name: 'model-a', backend_id: 'local', cost_tier_name: 'local', actual_score: 0.88, required_bar: 0.8 },
  { correlation_id: 'run-prev-pass', created_at: at(-13, '10:00'), written_at: at(-13, '10:00'), quality_gate_passed: true, quality_gate_detail: 'completed', latency_ms: 900, cost_usd: 12, tokens_input: 80, tokens_output: 20, task_type: 'summarization', model_name: 'model-a', backend_id: 'local', cost_tier_name: 'local', actual_score: 0.9, required_bar: null, modelled_savings_usd: '0.0100', savings_baseline_model: 'baseline-a' },
  { correlation_id: 'run-prev-fail', created_at: at(-13, '11:00'), written_at: at(-13, '11:00'), quality_gate_passed: false, quality_gate_detail: 'TIMEOUT: remote step', latency_ms: 1200, cost_usd: 1, tokens_input: 10, tokens_output: 2, task_type: 'code_generation', model_name: 'model-b', backend_id: 'cloud', cost_tier_name: 'cloud', actual_score: 0.4, required_bar: 0.8 },
  { correlation_id: 'run-yesterday', created_at: at(-1, '12:00'), written_at: at(-1, '12:00'), quality_gate_passed: true, quality_gate_detail: 'completed', latency_ms: 7780, cost_usd: 0, tokens_input: 0, tokens_output: 0, task_type: 'summarization', model_name: 'model-a', backend_id: 'local', cost_tier_name: 'local', actual_score: 0.8, required_bar: 0.8 },
  { correlation_id: 'run-today-unmeasured', created_at: at(0, '09:00'), written_at: at(0, '09:00'), quality_gate_passed: true, quality_gate_detail: 'completed', latency_ms: null, cost_usd: null, tokens_input: null, tokens_output: 0, task_type: 'summarization', model_name: 'model-a', backend_id: 'local', cost_tier_name: 'local', actual_score: 0.92, required_bar: null, modelled_savings_usd: '0.0100', savings_baseline_model: 'baseline-a', savings_measurement: 'measured' },
  { correlation_id: 'run-today-fail', created_at: at(0, '09:30'), written_at: at(0, '09:30'), quality_gate_passed: false, quality_gate_detail: 'RATE_LIMIT: provider refused', latency_ms: 1200, cost_usd: 0.2, tokens_input: 10, tokens_output: 3, task_type: 'code_generation', model_name: 'model-b', backend_id: 'cloud', cost_tier_name: 'cloud', actual_score: 0.5, required_bar: 0.8 },
];

const meteringDays = [
  { tenant_id: 'mock-tenant', window_kind: 'all', window_start: null, as_of: at(0, '12:00'), baseline_model: 'baseline-a', baseline_state: 'resolved', spend_usd: '0.25', counterfactual_usd: '0.65', savings_usd: '0.40', runs_total: 2 },
  { tenant_id: 'mock-tenant', window_kind: 'day', window_start: utcDay(-1), baseline_model: 'baseline-a', baseline_state: 'resolved', spend_usd: '0.25', counterfactual_usd: '0.65', savings_usd: '0.40', runs_total: 2 },
];
const usageRows = [
  { usage_day: utcDay(0), model_id: 'model-a', cost_tier_name: 'local', input_tokens: 80, output_tokens: 20, measured_cost_usd: '0.50', call_count: 2, unmeasured_call_count: 1, call_share: '0.6667' },
  { usage_day: utcDay(0), model_id: 'model-b', cost_tier_name: 'cloud', input_tokens: null, output_tokens: 3, measured_cost_usd: null, call_count: 1, unmeasured_call_count: 1, call_share: '0.3333' },
  { usage_day: utcDay(-1), model_id: 'model-c', cost_tier_name: 'local', input_tokens: 0, output_tokens: 0, measured_cost_usd: 0, call_count: 1, unmeasured_call_count: 0, call_share: '1.0000' },
  { usage_day: utcDay(-2), model_id: 'model-unmeasured', cost_tier_name: 'cloud', input_tokens: null, output_tokens: null, measured_cost_usd: null, call_count: 2, unmeasured_call_count: 2, call_share: '0.3333' },
];
const modelRouting = [{ total_delegations: 3, by_tier: { total_tasks: 3, tier_routed_total: 3, not_tier_routed_count: 0, tiers: [
  { cost_tier_name: 'local', count: 2, pct_of_tier_routed: 0.667, cost_usd: '0.50' },
  { cost_tier_name: 'cloud', count: 1, pct_of_tier_routed: 0.333, cost_usd: null },
] } }];

function fixtureRows(overrides: Record<string, unknown[]> = {}) {
  return {
    ...chartRows,
    [prefix + 'delegation.decisions.v1']: decisions,
    [prefix + 'metering-summary.v1']: meteringDays,
    [prefix + 'usage-by-model-day.v1']: usageRows,
    [prefix + 'delegation.model-routing.v1']: modelRouting,
    ...overrides,
  };
}

test('AC26 Overview applies the selected window, compares only complete periods, and keeps daily savings sourced', async ({ page }, info) => {
  await serveCharts(page, fixtureRows());
  await page.goto('/overview');
  const window = page.getByRole('group', { name: 'Activity window' });
  await expect(window.getByRole('button', { name: '7 days', exact: true })).toBeVisible();
  await expect(window.getByRole('button', { name: '15 days', exact: true })).toBeVisible();
  await window.getByRole('button', { name: '7 days', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Pass rate trend' })).toContainText('16.7 percentage points');
  await expect(page.getByRole('region', { name: 'Pass rate trend' })).toContainText('vs previous 7 days');
  const windowKpis = page.getByRole('region', { name: 'Summary for last 7 UTC days' });
  await expect(windowKpis).toContainText('Unavailable');
  await expect(windowKpis).toContainText('selected window is incomplete');
  await page.getByText('Detailed activity analysis', { exact: true }).click();
  const duration = page.getByRole('figure', { name: 'How long runs take', exact: true });
  const fiveToTenSeconds = duration.getByRole('button', { name: '5 seconds to 10 seconds: 1 runs' });
  await fiveToTenSeconds.focus();
  await expect(duration).toContainText('5 seconds to 10 seconds · 1 runs');
  await expect(page.locator('[data-component="overview-insights"]')).toContainText('Median duration');
  const cumulative = page.getByRole('figure', { name: 'Cumulative savings', exact: true });
  await expect(cumulative).toContainText('$0.40');
  await expect(cumulative.getByRole('status')).toContainText('Served rows only · cumulative incomplete');
  const yesterdayLabel = new Date(`${utcDay(-1)}T00:00:00Z`).toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const cumulativeDay = cumulative.getByRole('group', { name: 'Cumulative savings by UTC day' })
    .getByRole('button', { name: new RegExp(`${yesterdayLabel}.*cumulative \\$0\\.40`) });
  await cumulativeDay.focus();
  await expect(cumulative.getByRole('status')).toContainText('cumulative $0.40');
  const spendByDay = page.getByRole('figure', { name: 'Spend vs all-cloud', exact: true });
  const servedSpendDay = spendByDay.getByRole('group', { name: 'Spend vs all-cloud by UTC day' })
    .getByRole('button', { name: /Paid \$0\.25/ });
  await servedSpendDay.focus();
  await expect(spendByDay.getByRole('status')).toContainText('Paid $0.25');
  await page.screenshot({ path: info.outputPath('overview-mockup-parity.png'), fullPage: true });

  await serveCharts(page, fixtureRows({ [prefix + 'delegation.decisions.v1']: [decisions[2]!, decisions[3]!], [prefix + 'metering-summary.v1']: [
    { tenant_id: 'mock-tenant', window_kind: 'all', window_start: null, spend_usd: '9.99', savings_usd: '8.88', counterfactual_usd: '18.87', runs_total: 5 },
  ] }));
  await page.goto('/overview');
  await page.getByRole('group', { name: 'Activity window' }).getByRole('button', { name: '7 days', exact: true }).click();
  await expect(page.locator('[data-component="overview-insights"]')).toContainText('Previous window not fully returned');
  await expect(page.locator('[data-component="overview-insights"]')).toContainText('Daily metering data is unavailable: no day rows are served.');
  await expect(page.locator('[data-component="overview-insights"]')).toContainText('Unavailable');
  await expect(page.locator('[data-component="overview-insights"]')).not.toContainText('8.88');
  await expect(page.locator('[data-component="overview-insights"]')).not.toContainText('$12.00');
  await page.screenshot({ path: info.outputPath('overview-truncated-previous-and-unserved.png'), fullPage: true });
});

test('AC27 Runs filters by UTC day and task, then shows the selected run without filling missing fields', async ({ page }, info) => {
  await serveCharts(page, fixtureRows());
  await page.goto('/runs');
  const week = page.getByRole('group', { name: 'This week' });
  const listTop = await page.getByRole('heading', { name: 'Run list', exact: true }).evaluate(element => element.getBoundingClientRect().top);
  const weekHeading = page.getByRole('heading', { name: 'This week', exact: true });
  expect(await weekHeading.count()).toBe(1);
  const weekTop = await weekHeading.evaluate(element => element.getBoundingClientRect().top);
  const filtersTop = await page.locator('.local-runs-search').evaluate(element => element.getBoundingClientRect().top);
  const listBox = await page.locator('.local-runs-wrap').boundingBox();
  expect(listBox).not.toBeNull();
  expect(filtersTop).toBeLessThan(listTop);
  expect(weekTop).toBeGreaterThanOrEqual(listBox!.y + listBox!.height - 1);
  const dayFilters = page.getByRole('group', { name: 'Run days' });
  const today = dayFilters.getByRole('button', { name: new RegExp(`Filter day Today.*${utcDay(0)}`) });
  await today.click();
  await expect(today).toHaveAttribute('aria-pressed', 'true');
  await expect(week.getByRole('status')).toContainText('2 runs · 1 passed · 1 failed');
  await expect(page).toHaveURL(new RegExp(`day=${utcDay(0)}`));
  await expect(page.getByRole('row', { name: /run-today-unmeasured/ })).toBeVisible();
  const task = page.getByRole('button', { name: /Filter task code_generation/ });
  await expect(task).toContainText('1');
  await today.click();
  await expect(today).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('row', { name: /run-prev-pass/ })).toBeVisible();

  await expect(task).toContainText('2');
  await task.click();
  await expect(task).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('row', { name: /run-today-fail/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /run-yesterday/ })).toHaveCount(0);
  await task.click();
  await expect(task).toHaveAttribute('aria-pressed', 'false');

  await page.getByRole('row', { name: /run-today-unmeasured/ }).click();
  const selected = page.getByRole('complementary', { name: 'Selected run' });
  await expect(selected).toContainText('run-today-unmeasured');
  await expect(selected).toContainText('Task');
  await expect(selected).toContainText('Not recorded');
  await expect(selected.locator('dt').filter({ hasText: /^Tokens out$/ }).locator('xpath=following-sibling::dd')).toHaveText('0');
  await expect(selected).toContainText('$0.0100 vs baseline-a');
  await expect(selected).toContainText('Quality score');
  await expect(selected).toContainText('bar not recorded');
  await expect(selected.getByRole('link', { name: 'Open full run', exact: true })).toHaveAttribute('href', /workflow\?correlation_id=run-today-unmeasured/);
  await selected.getByRole('link', { name: 'Open full run', exact: true }).click();
  await expect(page).toHaveURL(/workflow\?correlation_id=run-today-unmeasured/);
  await page.screenshot({ path: info.outputPath('runs-selected-detail.png'), fullPage: true });
});

test('AC27 selected failed run shows its served result, time, cause, route facts and quality comparison', async ({ page }) => {
  await serveCharts(page, fixtureRows());
  await page.goto('/runs');
  await page.getByRole('row', { name: /run-today-fail/ }).click();
  const selected = page.getByRole('complementary', { name: 'Selected run' });
  await expect(selected.locator('.local-run-pill')).toHaveText('failed');
  await expect(selected.locator('time')).toHaveAttribute('datetime', at(0, '09:30'));
  await expect(selected.locator('.local-task-cell')).toContainText('code_generation');
  for (const [label, value] of [
    ['Cause', 'RATE_LIMIT: provider refused'], ['Model', 'model-b'], ['Route tier', 'cloud'], ['Duration', '1200 ms'], ['Cost', '$0.20'],
    ['Tokens in', '10'], ['Tokens out', '3'], ['Quality score', '0.5'], ['Required bar', '0.8'],
  ]) {
    await expect(selected.locator('dt').filter({ hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::dd')).toHaveText(value);
  }
  await expect(selected.locator('[role="meter"]')).toHaveAttribute('aria-valuenow', '0.5');
  await expect(selected.locator('[role="meter"]')).toHaveAttribute('aria-valuetext', /0\.5.*0\.8/);
  const table = page.locator('.local-runs-wrap');
  const tableBox = await table.boundingBox();
  const selectedBox = await selected.boundingBox();
  expect(tableBox).not.toBeNull();
  expect(selectedBox).not.toBeNull();
  expect(selectedBox!.x).toBeGreaterThanOrEqual(tableBox!.x + tableBox!.width - 1);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => {
    const mobileTable = await table.boundingBox();
    const mobileSelected = await selected.boundingBox();
    return Boolean(mobileTable && mobileSelected && mobileSelected.y >= mobileTable.y + mobileTable.height - 1);
  }).toBe(true);
});

test('AC27 selection moves to the first listed run when paging hides the selected run', async ({ page }) => {
  const pagedRuns = Array.from({ length: 26 }, (_, index) => ({
    ...decisions[2]!, correlation_id: `paged-${index}`, created_at: at(0, `10:${String(index).padStart(2, '0')}`),
    written_at: at(0, `10:${String(index).padStart(2, '0')}`),
  }));
  await serveCharts(page, fixtureRows({ [prefix + 'delegation.decisions.v1']: pagedRuns }));
  await page.goto('/runs');
  await page.getByRole('row', { name: /paged-25/ }).click();
  const selected = page.getByRole('complementary', { name: 'Selected run' });
  await expect(selected.locator('code')).toHaveText('paged-25');
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(selected.locator('code')).toHaveText('paged-0');
});

test('AC29 Usage exposes measured model spend, per-call cost, tokens, and honest unavailable route savings', async ({ page }, info) => {
  await serveCharts(page, fixtureRows());
  await page.goto('/usage');
  const spend = page.getByRole('figure', { name: 'Spend by model', exact: true });
  const alpha = spend.getByRole('button', { name: /model-a.*\$0\.50.*1 unmeasured/ });
  await expect(alpha).toBeVisible();
  await alpha.focus();
  await expect(spend.getByRole('status')).toContainText('model-a');
  await expect(spend.getByRole('status')).toContainText('$0.50');
  const perCall = page.getByRole('figure', { name: 'Cost per run', exact: true });
  await expect(perCall).toContainText('$0.50');
  const allUnmeasuredDay = perCall.getByRole('button', { name: new RegExp(`${utcDay(-2)}.*measured cost per call Not measured.*2 unmeasured calls`) });
  await allUnmeasuredDay.focus();
  await expect(perCall.getByRole('status')).toContainText('measured cost per call Not measured');
  const tokens = page.getByRole('figure', { name: 'Tokens in vs out by model', exact: true });
  await expect(tokens.getByRole('button', { name: /model-a/ })).toBeVisible();
  await expect(tokens).toContainText('80 tokens in');
  await expect(tokens).toContainText('20 tokens out');
  await expect(page.getByRole('table', { name: 'Usage by model and day', exact: true })).toContainText('model-b');
  await expect(page.getByRole('region', { name: 'Cost by route', exact: true })).toContainText('$0.50');
  await expect(page.getByText('Savings by route is not served yet', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('usage-mockup-parity.png'), fullPage: true });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  }
});

test('AC31 new dashboard charts and filters do not widen phone viewports', async ({ page }) => {
  await serveCharts(page, fixtureRows());
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of ['/overview', '/runs']) {
      await page.goto(path);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    }
  }
});
