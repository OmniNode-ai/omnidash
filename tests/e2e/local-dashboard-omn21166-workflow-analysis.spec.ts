import { expect, test } from 'playwright/test';
import { chartRows, narrowTo, prefix, serveCharts } from './omn21166-chart-fixtures';

// Failure modes declared before implementation: charts borrow another run's
// data, null becomes zero, zero disappears, scores imply a made-up verdict,
// foreign trace rows are plotted, or phone charts overflow.
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', trace: 'on' });
const decisionsTopic = prefix + 'delegation.decisions.v1';
const baseRows = { ...chartRows,
    [decisionsTopic]: [{
      ...(chartRows[decisionsTopic][0] as object),
      tokens_input: 0, tokens_output: null, actual_score: '0.40', required_bar: '0.80',
      cost_usd: '0.000000', data_source: 'fixture', terminal_ok: false,
      latency_ms: 69555,
      tokens_to_compliance: 0, routed_model: 'served-routed-model', answering_backend: 'served-answering-backend',
      score_source: 'served-score-source', writer_identity: 'served-writer',
    }],
    [prefix + 'run-trace.v1']: [
      { correlation_id: 'chart-run-a', step_sequence: 1, step_kind: 'request', duration_ms: 0, outcome: 'succeeded' },
      { correlation_id: 'chart-run-a', step_sequence: 2, step_kind: 'provider_call', duration_ms: 120, outcome: 'succeeded' },
    ],
};
// OMN-21166 part 13: the Run timing card is left out when only the total duration is drawable (the Duration tile says
// the same). The timing-chart tests serve the run's queue wait and execution too, so the card is drawn.
const timedRows = { ...baseRows,
  [decisionsTopic]: [{ ...(baseRows[decisionsTopic][0] as object), queue_wait_ms: 1200, execution_ms: 68355 }],
};
test.beforeEach(async ({ page }) => { await serveCharts(page, baseRows); });

// Served decision extensions must preserve zero, remain scoped to the selected
// run, and omit unavailable optional provenance rather than add empty cards.
test('Workflow exposes available backend decision fields compactly', async ({ page }, info) => {
  await page.goto('/workflow?correlation_id=chart-run-a');
  // OMN-21166 part 13: Recorded run details sit under the closed "More run details".
  const details = page.getByRole('region', { name: 'Recorded run details', exact: true });
  for (const value of ['served-routed-model', 'served-answering-backend', 'served-score-source', 'served-writer']) {
    await expect(details).toContainText(value);
  }
  // OMN-22168: the details are four cards now, so the fact is the list row that holds its term (not any div around it).
  await expect(details.locator('dl > div').filter({ has: page.locator('dt', { hasText: /^Tokens to compliance$/ }) })).toContainText('0');
  await expect(details.getByText('Parent correlation', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('workflow-served-fields.png'), animations: 'disabled', fullPage: true });
  await page.goto('/workflow?correlation_id=unknown-run');
  await expect(page.getByText('No decision is served for this run', { exact: true })).toBeVisible();
  await expect(page.getByText('served-writer', { exact: true })).toHaveCount(0);
});

test('Workflow charts and recorded details read the selected run without inventing values', async ({ page }, info) => {
  await page.goto('/workflow?correlation_id=chart-run-a');
  // OMN-22168 (Lakshman 2026-11-05, "remove duplicates"): the Token flow and Quality score comparisons repeated the
  // Tokens and Run outcome cards, and the stage chart repeated the Run timeline's step durations, so all three are gone.
  // Every value they drew is still read here, from the one place it is now shown.
  for (const gone of ['Token flow', 'Quality score and threshold', 'Execution stage durations']) {
    await expect(page.getByRole('figure', { name: gone, exact: true }), `${gone} is not drawn twice`).toHaveCount(0);
  }
  const tokens = page.getByRole('region', { name: 'Tokens and completion', exact: true });
  await expect(tokens).toBeVisible();
  await expect(tokens).toContainText('Tokens in');
  await expect(tokens).toContainText('0');
  await expect(tokens).toContainText('Not recorded');
  const quality = page.getByRole('region', { name: 'Run outcome', exact: true });
  await expect(quality).toContainText('0.40');
  await expect(quality).toContainText('0.80');
  // The step durations are the Run timeline's (provider call, 120 ms served).
  await expect(page.locator('main ol')).toContainText('120 ms');
  // 3c5cb779: the recorded cost reads as money, not the raw served decimal.
  // OMN-22168 (Lakshman 2026-11-05): a measured zero is the run table's muted "$0", the served "$0.00" its title.
  await expect(page.getByRole('region', { name: 'Recorded run details', exact: true })).toContainText('Recorded cost (USD)$0');
  await expect(page.getByRole('region', { name: 'Recorded run details', exact: true }).getByTitle('$0.00')).toHaveText('$0');
  await expect(page.getByRole('region', { name: 'Recorded run details', exact: true })).toContainText('fixture');
  await page.screenshot({ path: info.outputPath('workflow-analysis-desktop.png'), animations: 'disabled', fullPage: true });
  await narrowTo(page, 390, 844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await tokens.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('workflow-analysis-phone.png'), animations: 'disabled' });
});

test('an unknown run does not inherit the newest run charts or foreign stage durations', async ({ page }) => {
  await page.goto('/workflow?correlation_id=unknown-run');
  await expect(page.getByText('No decision is served for this run', { exact: true })).toBeVisible();
  await expect(page.getByRole('figure', { name: 'Token flow', exact: true })).toHaveCount(0);
  await expect(page.getByRole('figure', { name: 'Execution stage durations', exact: true })).toHaveCount(0);
  // OMN-22168: those charts are removed for every run; the property here is that no foreign values appear instead.
  await expect(page.getByText('120 ms', { exact: true })).toHaveCount(0);
});

test('compact timing ticks remain readable without overlapping', async ({ page }) => {
  await serveCharts(page, timedRows);
  await page.goto('/workflow?correlation_id=chart-run-a');
  const chart = page.getByRole('figure', { name: 'Run timing', exact: true });
  // The plot's own canvas: since OMN-23330 (2026-11-11) the figure also holds its Chart and Table switch glyphs.
  await expect(chart.locator('.local-chart-canvas svg')).toBeVisible();
  const ticks = await chart.locator('.local-chart-canvas svg text').evaluateAll(elements => elements
    // OMN-21166 part 13: with the queue and execution bars served the axis runs to 70 s, so tick labels read in s and min as well as ms.
    .filter(element => /^\d[\d,.]* (ms|s)$|^\d+ min \d+ s$/.test(element.textContent?.trim() ?? ''))
    .map(element => { const rect = element.getBoundingClientRect(); return { x: rect.x, y: Math.round(rect.y), right: rect.right, width: rect.width }; })
    .filter(rect => rect.width > 0));
  expect(ticks.length).toBeGreaterThan(1);
  const collisions = ticks.filter((tick, index) => ticks.slice(index + 1).some(other => tick.y === other.y && tick.x < other.right && other.x < tick.right));
  expect(collisions).toEqual([]);
});

test('each analysis card keeps its accent in its chart and icon', async ({ page }) => {
  await serveCharts(page, timedRows);
  await page.goto('/workflow?correlation_id=chart-run-a');
  const timing = page.locator('.workflow-analysis-card--timing');
  await expect(timing.locator('svg').last()).toBeVisible();
  // A hatched bar carries its colour in its outline's stroke (live review 2026-10-26). OMN-23330 (Lakshman 2026-11-11, "use
  // good colors"): each timing wears its own series colour, not a shade of the card's accent; the card keeps its accent on
  // its heading icon. The bars are the filled, hatched paths: each draws its stroke in its own colour.
  const accent = (await timing.evaluate(element => getComputedStyle(element).getPropertyValue('--analysis-accent').trim())).toLowerCase();
  const bars = async () => [...new Set(await timing.locator('.local-chart-canvas path[stroke][fill]:not([fill="none"])')
    .evaluateAll(paths => paths.map(path => (path.getAttribute('stroke') ?? '').toLowerCase()).filter(stroke => /^#[0-9a-f]{6}$/.test(stroke))))];
  await expect.poll(async () => (await bars()).length).toBeGreaterThanOrEqual(2);
  expect(await bars()).not.toContain(accent);
  const accents = await page.locator('.local-run-summary-group, .workflow-analysis-card').evaluateAll(elements => elements.map(element => {
    const style = getComputedStyle(element);
    return style.getPropertyValue('--fact-accent').trim() || style.getPropertyValue('--analysis-accent').trim();
  }));
  expect(new Set(accents).size).toBe(accents.length);
});

test('recorded steps show in the timeline without a box row or decorative particles', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/workflow?correlation_id=chart-run-a');
  // OMN-21166 part 18 AC125: the row of step boxes (and its links) is removed; the timeline below shows the same steps.
  const flow = page.getByRole('navigation', { name: 'Run steps, in the order served', exact: true });
  await expect(flow).toHaveCount(0);
  await expect(page.locator('nav.local-run-diagram')).toHaveCount(0);
  await expect(page.locator('.workflow-flow-particle')).toHaveCount(0);
  await expect(page.locator('ol.local-dashboard-steps > li')).toHaveCount(2);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('ol.local-dashboard-steps > li')).toHaveCount(2);
  // Each timeline step keeps its own anchor.
  await expect(page.locator('ol.local-dashboard-steps > li#run-step-2')).toHaveCount(1);
});

test('a run with no trace retains its recorded routing fields without filler labels', async ({ page }) => {
  await page.route('**/*run-trace.v1*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ rows: [], row_count: 0, data_freshness: 'fresh' }) }));
  await page.goto('/workflow?correlation_id=chart-run-a');
  const flow = page.getByRole('region', { name: 'Recorded routing flow', exact: true });
  await expect(flow).toBeVisible();
  await expect(flow).toContainText('model-a');
  await expect(flow).not.toContainText('decision fields');
  await expect(flow).toContainText('local');
  await expect(page.getByRole('navigation', { name: 'Run steps, in the order served', exact: true })).toHaveCount(0);
});

test('phone timing labels stay inside the chart without clipping their units', async ({ page }) => {
  await serveCharts(page, timedRows);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/workflow?correlation_id=chart-run-a');
  const collapse = page.getByRole('button', { name: 'Collapse sidebar', exact: true });
  if (await collapse.isVisible()) await collapse.click();
  // The plot's own canvas, not the Chart and Table switch glyphs beside it (OMN-23330, 2026-11-11).
  const svg = page.getByRole('figure', { name: 'Run timing', exact: true }).locator('.local-chart-canvas svg');
  await expect(svg).toBeVisible();
  let previous = '';
  await expect.poll(async () => {
    const current = JSON.stringify(await svg.locator('text').evaluateAll(elements => elements.map(element => {
      const rect = element.getBoundingClientRect(); return [rect.left, rect.right, rect.width];
    })));
    const settled = current === previous;
    previous = current;
    return settled;
  }, { intervals: [200] }).toBe(true);
  const clipped = await svg.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return [...element.querySelectorAll('text')].filter(text => {
      const rect = text.getBoundingClientRect();
      return rect.width > 0 && (rect.left < bounds.left - 1 || rect.right > bounds.right + 1);
    }).map(text => text.textContent);
  });
  expect(clipped).toEqual([]);
});
