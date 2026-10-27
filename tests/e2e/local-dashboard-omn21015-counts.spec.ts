import { expect, test } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';
test.use({ viewport: { width: 1440, height: 900 }, trace: 'on', reducedMotion: 'reduce' });
// Real UI failures: raw headline/count table values, compacted directions, equal colors,
// clipped full integers, a missing input silently zeroed, lost paging and source values changed.
for (const theme of ['light', 'dark'] as const) {
  test(`compact totals and full directional tokens in ${theme}`, async ({ page }, info) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.addInitScript(value => localStorage.setItem('omnidash.theme.v1', value), theme);
    await serveCharts(page, { ...chartRows,
      [prefix + 'cost.savings-overview.v1']: [{ window: 'all', captured_at: '2026-10-22T10:00:00Z',
        total_cost_usd: '3.5923', total_savings_usd: '1074.2157', run_count: '59188',
        // Dev #462 (omnimarket#4341): cost.savings-overview.v1 serves its directions as tokens_input_total / tokens_output_total.
        tokens_total: '309271491', tokens_input_total: '300000001', tokens_output_total: '9271490' }],
      [prefix + 'usage-by-model-day.v1']: [{ usage_day: '2026-10-01', model_id: 'model-a',
        input_tokens: '300000001', output_tokens: '9271490', call_count: 59188, measured_cost_usd: '3.5923', cost_tier_name: 'local', call_share: 1 }],
      [prefix + 'metering-summary.v1']: [{ window_kind: 'day', window_start: '2026-10-01',
        baseline_model: 'baseline-a', baseline_state: 'resolved', savings_usd: '3.5923', runs_total: 59188 }],
    });
    await page.goto('/overview');
    await expect(page.locator('body')).toHaveClass(new RegExp(`\\btheme-${theme}\\b`));
    await expect(page.locator('[data-component="overview-measured"] .local-dashboard-metric')).toHaveText('59.18K');
    const tokens = page.locator('[data-component="overview-tokens"]');
    await expect(tokens.locator('.local-dashboard-metric')).toHaveText('309.27M');
    // OMN-21166 part 12 AC73 (live review 2026-10-25, "in out token also - show it when hover it"): the directions are
    // in the card's tooltip, opened as a keyboard reader opens it, by focusing the card's info button.
    // Part 29 AC191: the basis is the card's caption, always in the page; no About button to focus.
    await expect(tokens.locator('[data-field-tone="tokens-in"]')).toBeVisible();
    await expect(tokens.locator('[data-field-tone="tokens-in"]')).toContainText('300,000,001');
    await expect(tokens.locator('[data-field-tone="tokens-out"]')).toContainText('9,271,490');
    await expect(tokens.getByLabel('Input tokens: 300,000,001', { exact: true })).toHaveAttribute('title', 'Input tokens: 300,000,001');
    await expect(tokens.getByLabel('Output tokens: 9,271,490', { exact: true })).toHaveAttribute('title', 'Output tokens: 9,271,490');
    await expect(tokens.locator('.local-token-directions')).not.toContainText('Input');
    await expect(tokens.locator('.local-token-directions')).not.toContainText('Output');
    // Part 29 AC191 (lab 2026-10-27): in the caption the two directions wrap whole when a four-across card is too narrow
    // for both; neither may be clipped or run past the card's edge (the old one-line tooltip rule cannot hold at 1440).
    const pair = await tokens.locator('.local-token-direction').all();
    const caption = (await tokens.locator('.local-card-caption').boundingBox())!;
    for (const half of pair) {
      const box = (await half.boundingBox())!;
      expect(box.x + box.width).toBeLessThanOrEqual(caption.x + caption.width + 0.5);
      expect(await half.evaluate(el => el.scrollWidth <= el.clientWidth + 0.5)).toBe(true);
    }
    expect(await tokens.locator('[data-field-tone="tokens-in"]').evaluate(el => getComputedStyle(el).color))
      .not.toBe(await tokens.locator('[data-field-tone="tokens-out"]').evaluate(el => getComputedStyle(el).color));
    await page.screenshot({ path: info.outputPath(`overview-counts-${theme}.png`), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    const collapse = page.getByRole('button', { name: 'Collapse sidebar', exact: true });
    if (await collapse.isVisible()) await collapse.click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    // Part 29 AC191: the directions are in the card's caption; nothing to focus.
    await expect(tokens.locator('[data-field-tone="tokens-in"]')).toBeVisible();
    // On a phone the card is one column wide, so both directions fit and stay on one line (wrapping only when needed).
    const smallPair = await tokens.locator('.local-token-direction').all();
    expect(Math.abs((await smallPair[0]!.boundingBox())!.y - (await smallPair[1]!.boundingBox())!.y)).toBeLessThan(2);
    await page.goto('/usage');
    await expect(page.locator('[data-component="usage-savings-series"] td[data-label="Runs"]')).toHaveText('59.18K');
    await expect(page.locator('[data-component="usage-by-model-day"]')).toContainText('300,000,001');
    await expect(page.locator('[data-component="usage-by-model-day"]')).toContainText('59.18K');
    await page.screenshot({ path: info.outputPath(`usage-counts-${theme}.png`), fullPage: true });
  });
}

test('metering-backed Overview uses the same compact total and arrow-only full directions', async ({ page }) => {
  const overview = prefix + 'cost.savings-overview.v1';
  await serveCharts(page, { ...chartRows, [prefix + 'metering-summary.v1']: [{
    window_kind: 'all', window_start: '', as_of: '2026-10-22T10:00:00Z',
    baseline_model: 'baseline-a', baseline_state: 'resolved', tokens_in: 5756, tokens_out: 378,
  }] });
  await page.route('**/projections', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ topics:
    Object.keys(chartRows).map(topic => topic === overview
      ? { topic, status: 'degraded', backing: 'not_in_local_store', bus_backed: false, degraded_reason: 'projection_table_missing' }
      : { topic, status: 'ok', backing: 'bus', bus_backed: true, tenant_scoped: false }) }) }));
  await page.goto('/overview');
  const tokens = page.locator('[data-component="overview-tokens"]');
  await expect(tokens.locator('.local-dashboard-metric')).toHaveText('6.13K');
  // OMN-21166 live review 2026-10-25: on the metering path the Tokens card is its compact total, and the full
  // directions (whole integers, never compacted) are its hover line, a tooltip that is the info button's description.
  await expect(tokens.locator('.local-card-caption')).toHaveText('5,756 in · 378 out');
  await expect(tokens.getByRole('button', { name: 'About Tokens processed' })).toHaveCount(0);
  await expect(tokens).not.toContainText('Input');
  await expect(tokens).not.toContainText('Output');
});

test('Evidence selected-run directional counts remain full integers', async ({ page }, info) => {
  const run = { ...chartRows[prefix + 'delegation.decisions.v1']![0] as object,
    tokens_input: 300000001, tokens_output: 9271490 };
  await serveCharts(page, { ...chartRows,
    [prefix + 'delegation.decisions.v1']: [run],
    [prefix + 'delegation.correlation-trace.v1']: [run],
  });
  await page.goto('/delegation-evidence');
  const selected = page.locator('[data-panel-title="SELECTED RUN"]');
  await expect(selected.locator('[data-field-tone="tokens-in"] .v')).toHaveText('300,000,001');
  await expect(selected.locator('[data-field-tone="tokens-out"] .v')).toHaveText('9,271,490');
  await page.screenshot({path:info.outputPath('evidence-full-directions.png'),fullPage:true});
});

test('Overview and Evidence derive missing calls from complete same-row model groups', async ({ page }, info) => {
  await serveCharts(page, { ...chartRows, [prefix + 'cost.savings-overview.v1']: [{
    window: 'all', captured_at: '2026-10-22T10:00:00Z', run_count: null,
    measured_run_count: 59180, estimated_run_count: 0, unknown_run_count: 8,
    tokens_total: 309271491, total_cost_usd: '3.5923', total_savings_usd: '1074.2157',
    rows: [{model_id:'model-a',display_name:'Model A',task_count:59180},{model_id:'model-b',display_name:'Model B',task_count:8}],
  }] });
  await page.goto('/overview');
  await expect(page.locator('[data-component="overview-measured"] .local-dashboard-metric')).toHaveText('59.18K');
  await page.goto('/delegation-evidence');
  const calls = page.locator('article[data-kpi-card="Delegations"]'); // part 15 AC91: an Overview card
  await expect(calls.locator('.local-dashboard-metric')).toHaveText('59.18K');
  await page.screenshot({path:info.outputPath('derived-calls-evidence.png'),fullPage:true});
});

test('Evidence savings discloses unavailable unpriced coverage without borrowing another population', async ({page}, info) => {
  await serveCharts(page, {...chartRows,
    [prefix+'cost.savings-overview.v1']: [{window:'all',captured_at:'2026-10-22T10:00:00Z',total_cost_usd:'3.5923',total_baseline_cost_usd:'1077.8080',total_savings_usd:'1074.2157',measured_run_count:9,unknown_run_count:2}],
    [prefix+'delegation.savings.v1']: [{baseline_model:'separate-baseline',pricing_manifest_version:'7',unpriced_call_count:999,sessions:[]}],
  });
  await page.goto('/delegation-evidence');
  const panel=page.locator('[data-panel-title="SAVINGS vs CLOUD BASELINE"]');
  await expect(panel.locator('.big')).toHaveText('$1,074.21');
  await expect(panel).toContainText('Unpriced runs not recorded');
  await expect(panel).not.toContainText('999');
  await page.screenshot({path:info.outputPath('evidence-unpriced-coverage.png'),fullPage:true});
});

for (const theme of ['light','dark'] as const) {
  test(`model identity keeps its color across Runs and Usage in ${theme}`, async ({page}, info) => {
    await page.addInitScript(value => localStorage.setItem('omnidash.theme.v1', value), theme);
    await serveCharts(page, {...chartRows, [prefix+'usage-by-model-day.v1']: [
      {usage_day:'2026-10-17',model_id:'model-b',input_tokens:200,output_tokens:50,measured_cost_usd:'9',call_count:2},
      {usage_day:'2026-10-17',model_id:'model-a',input_tokens:100,output_tokens:20,measured_cost_usd:'1',call_count:1},
    ]});
    await page.goto('/runs');
    await expect(page.locator('body')).toHaveClass(new RegExp(`\\btheme-${theme}\\b`));
    // OMN-21166 part 13 + AC64: Runs' analysis is under the page's closed "More analysis", and the model scoreboard
    // rings are ranked bars ("Pass rate by model") whose name is written in the model's colour.
    await page.locator('summary').filter({hasText:/^More analysis$/}).click();
    const model = page.getByRole('figure',{name:'Pass rate by model',exact:true}).locator('[data-ranked-item]').filter({has:page.getByText('model-a',{exact:true})});
    await expect(model).toBeVisible();
    const color = await model.locator('.rb-name').evaluate(el => getComputedStyle(el).color);
    await page.goto('/usage');
    // OMN-21166 AC64: Usage's spend donut and legend buttons are ranked bars ("Measured spend per model"); the
    // stacked "Tokens per day" chart's legend swatch carries the same model colour.
    const spend = page.getByRole('figure',{name:'Measured spend per model',exact:true}).locator('[data-ranked-item]').filter({has:page.getByText('model-a',{exact:true})});
    await expect(spend).toBeVisible();
    expect(await spend.locator('.rb-name').evaluate(el => getComputedStyle(el).color)).toBe(color);
    const legend = page.locator('.utc-legend li').filter({hasText:'model-a'});
    await expect(legend).toBeVisible();
    expect(await legend.locator('i').evaluate(el => getComputedStyle(el).backgroundColor)).toBe(color);
    await page.screenshot({path:info.outputPath(`model-colors-${theme}.png`),fullPage:true});
  });
}
