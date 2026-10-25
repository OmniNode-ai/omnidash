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
  // Served shape: a tier has no cost_usd of its own; cost_usd and unmeasured_cost_count are on its models.
  { cost_tier_name: 'local', count: 2, tier_routed: true, pct_of_tier_routed: 0.667, models: [
    { model_name: 'model-a', count: 2, pct_of_tier_routed: 0.667, cost_usd: '0.50', unmeasured_cost_count: 0 },
  ] },
  { cost_tier_name: 'cloud', count: 1, tier_routed: true, pct_of_tier_routed: 0.333, models: [
    { model_name: 'model-b', count: 1, pct_of_tier_routed: 0.333, cost_usd: null, unmeasured_cost_count: 1 },
  ] },
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

test('AC26 Overview applies the selected window to cards and charts and never invents a daily figure from an all-time row', async ({ page }, info) => {
  await serveCharts(page, fixtureRows());
  await page.goto('/overview');
  // Live review 2026-10-25 ("unified"): the window presets are the header's one control (radiogroup "Figures for"),
  // driving the cards and the charts; the custom dates are its calendar.
  const window = page.getByRole('radiogroup', { name: 'Figures for', exact: true });
  await expect(window.getByRole('radio', { name: 'Last 7 days (UTC)', exact: true })).toBeVisible();
  await expect(window.getByRole('radio', { name: 'Last 15 days (UTC)', exact: true })).toBeVisible();
  await window.getByRole('radio', { name: 'Last 7 days (UTC)', exact: true }).click();
  // OMN-21166 AC86 (Lakshman 2026-10-25): the Quality panel's pass-rate trend, "More activity" (its window run and spend
  // cards and Median duration), Cumulative savings and Spend vs all-cloud are deleted from Overview, so the complete-
  // period comparison checks on them are retired. What stays: the window drives the cards and the Runs per day chart,
  // a card never shows an all-time or served-elsewhere figure as a daily one, and Quality says it is all time.
  for (const id of ['overview-spend', 'overview-savings', 'overview-measured', 'overview-tokens']) {
    await expect(page.locator(`[data-component="${id}"] .local-dashboard-metric`)).toHaveText('Not measured: daily totals unavailable (UTC)');
  }
  await expect(page.locator('[data-component="overview-quality"] .local-dashboard-metric')).toHaveText('75.0%');
  await expect(page.locator('[data-component="overview-quality"] [role="tooltip"]')).toContainText('All time: the window above does not change this figure');
  await expect(page.locator('[data-component="overview-insights"][data-slice="runs"]')).toContainText('last 7 UTC days');
  await expect(page.getByRole('figure', { name: 'Cumulative savings', exact: true })).toHaveCount(0);
  await expect(page.getByRole('figure', { name: 'Spend vs all-cloud', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Pass rate trend' })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('overview-mockup-parity.png'), fullPage: true });
  // OMN-21166 part 13: the duration histogram moved to Runs' analysis, under its closed "More analysis". It reads every
  // served run (the Overview window does not apply there); one of them (run-yesterday, 7,780 ms) is 5 to 10 seconds.
  await page.goto('/runs');
  await page.locator('summary').filter({ hasText: /^More analysis$/ }).click();
  const duration = page.getByRole('figure', { name: 'How long runs take', exact: true });
  const fiveToTenSeconds = duration.getByRole('button', { name: '5 seconds to 10 seconds: 1 runs' });
  await fiveToTenSeconds.focus();
  await expect(duration).toContainText('5 seconds to 10 seconds · 1 runs');

  await serveCharts(page, fixtureRows({ [prefix + 'delegation.decisions.v1']: [decisions[2]!, decisions[3]!], [prefix + 'metering-summary.v1']: [
    { tenant_id: 'mock-tenant', window_kind: 'all', window_start: null, spend_usd: '9.99', savings_usd: '8.88', counterfactual_usd: '18.87', runs_total: 5 },
  ] }));
  await page.goto('/overview');
  await page.getByRole('radiogroup', { name: 'Figures for', exact: true }).getByRole('radio', { name: 'Last 7 days (UTC)', exact: true }).click();
  // An all-time row serves no day, so the 7-day cards stay unmeasured and none of its figures leaks in.
  await expect(page.locator('[data-component="overview-savings"] .local-dashboard-metric')).toHaveText('Not measured: daily totals unavailable (UTC)');
  await expect(page.locator('.local-overview-summary')).not.toContainText('8.88');
  await expect(page.locator('.local-overview-summary')).not.toContainText('9.99');
  await page.screenshot({ path: info.outputPath('overview-truncated-previous-and-unserved.png'), fullPage: true });
});

test('AC27 Runs filters by UTC day and task, then shows the selected run without filling missing fields', async ({ page }, info) => {
  await serveCharts(page, fixtureRows());
  await page.goto('/runs');
  // OMN-21166 part 13: the "This week" chart is under the closed "More run charts", below the run list.
  await page.locator('summary').filter({ hasText: /^More run charts$/ }).click();
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
  // OMN-21166 part 13: the "Days" chip row is gone; a UTC day in the address still filters the list and the week status
  // names it, and the task chips are the Task select (its option counts follow the other filters).
  await page.goto(`/runs?day=${utcDay(0)}`);
  await page.locator('summary').filter({ hasText: /^More run charts$/ }).click();
  await expect(week.getByRole('status')).toContainText('2 runs · 1 passed · 1 failed');
  await expect(page).toHaveURL(new RegExp(`day=${utcDay(0)}`));
  await expect(page.getByRole('row', { name: /run-today-unmeasured/ })).toBeVisible();
  const task = page.getByLabel('Task', { exact: true });
  await expect(task.locator('option', { hasText: 'code generation' })).toHaveText('code generation (1)');
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page).not.toHaveURL(/day=/);
  await expect(page.getByRole('row', { name: /run-prev-pass/ })).toBeVisible();

  await expect(task.locator('option', { hasText: 'code generation' })).toHaveText('code generation (2)');
  await task.selectOption('code_generation');
  await expect(page.getByRole('row', { name: /run-today-fail/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /run-yesterday/ })).toHaveCount(0);
  await task.selectOption('all');
  await expect(page.getByRole('row', { name: /run-yesterday/ })).toBeVisible();

  await page.getByRole('row', { name: /run-today-unmeasured/ }).click();
  const selected = page.getByRole('complementary', { name: 'Selected run' });
  await expect(selected).toContainText('run-today-unmeasured');
  await expect(selected).toContainText('Task');
  await expect(selected).toContainText('Not recorded');
  await expect(selected.locator('dt').filter({ hasText: /^Tokens out$/ }).locator('xpath=following-sibling::dd')).toHaveText('0');
  await expect(selected).toContainText('$0.01 vs baseline-a');
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
  // OMN-21166 (readable task names, 0d7d6df3): a task is written "code generation", not its served key.
  await expect(selected.locator('.local-task-cell')).toContainText('code generation');
  for (const [label, value] of [
    // Dev #455 (failure codes out of readable run details): the served "RATE_LIMIT: provider refused" reads "provider refused".
    ['Cause', 'provider refused'], ['Model', 'model-b'],
    // OMN-21166 AC54 / AC55: a tier and a duration are written as words ("Cloud", "1.2 s"), not as served (cloud, 1200 ms).
    ['Route tier', 'Cloud'], ['Duration', '1.2 s'], ['Cost', '$0.20'],
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
  // OMN-21166 AC64: spend by model is ranked bars (figure "Measured spend per model"); a bar is a list item named by its
  // model and measured value, a model with no measured spend is "Not measured" (never $0.00), and the count of
  // unmeasured runs is the figure's footnote.
  const bars = spend.getByRole('figure', { name: 'Measured spend per model', exact: true });
  const alpha = bars.getByRole('listitem', { name: /^model-a: \$0\.50, measured$/ });
  await expect(alpha).toBeVisible();
  await expect(bars.getByRole('listitem', { name: /^model-b: Not measured, not measured$/ })).toBeVisible();
  await expect(spend).toContainText('model-a: 1 unmeasured');
  await expect(spend).toContainText('model-b: 1 unmeasured');
  // OMN-21166 part 13: cost per run, tokens by model, cost by route and the per-day table are under "More usage".
  await page.locator('summary').filter({ hasText: /^More usage$/ }).click();
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
