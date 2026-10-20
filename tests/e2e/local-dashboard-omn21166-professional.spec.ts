import { expect, test } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

// Real failure modes identified before implementation: reused local main keeps
// another page's scroll; query changes must not remount filters; lazy chunks
// leave a blank pane; unused cost lookup warns on a cost-free preview; developer
// headers lose destination identity and Evidence headings shout in capitals.
test.use({ viewport: { width: 1440, height: 900 }, trace: 'on' });
test.beforeEach(async ({ page }) => { await serveCharts(page); });

test('page navigation starts at the top while query edits preserve scroll and input focus', async ({ page }, info) => {
  await page.goto('/overview');
  await expect(page.getByRole('heading', { name: 'Recent runs', exact: true })).toBeVisible();
  await page.locator('main').evaluate(el => { el.scrollTop = el.scrollHeight; });
  expect(await page.locator('main').evaluate(el => el.scrollTop)).toBeGreaterThan(100);
  await page.getByRole('link', { name: 'Runs', exact: true }).click();
  await expect(page.getByRole('searchbox', { name: 'Search runs' })).toBeVisible();
  expect(await page.locator('main').evaluate(el => el.scrollTop)).toBe(0);
  const input = page.getByRole('searchbox', { name: 'Search runs' });
  await input.fill('model');
  await expect(input).toHaveValue('model');
  await expect(input).toBeFocused();
  await expect(page).toHaveURL(/q=model/);
  await page.locator('main').evaluate(el => { el.scrollTop = 120; });
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  expect(await page.locator('main').evaluate(el => el.scrollTop)).toBe(120);
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  expect(await page.locator('main').evaluate(el => el.scrollTop)).toBe(0);
  await page.screenshot({ path: info.outputPath('navigation-top.png') });
});

test('a delayed destination chunk has an accessible loading page and recovers', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let requested!: () => void;
  const chunkRequested = new Promise<void>(resolve => { requested = resolve; });
  await page.route(/\/(?:assets\/DelegationEvidencePage-[^/]+\.js|src\/pages\/DelegationEvidencePage\.tsx)(?:\?.*)?$/, async route => {
    requested(); await gate; await route.continue();
  });
  await page.goto('/overview');
  await page.getByRole('link', { name: 'Delegation Evidence', exact: true }).click();
  await chunkRequested;
  try {
    await expect(page.getByRole('status')).toContainText('Loading Delegation Evidence');
    await expect(page.getByRole('heading', { name: 'Delegation Evidence', exact: true })).toBeVisible();
  } finally { release(); }
  await expect(page.locator('.ev-root')).toBeVisible();
});

test('preview ignores unused cost failures while cards displaying cost retain the warning', async ({ page }) => {
  await page.route(/\/projection\/.*delegation\.savings\.v1(?:\?|$)/, route => route.fulfill({ status: 503, body: '{}' }));
  await page.goto('/overview');
  const preview = page.locator('[data-component="overview-recent-runs"]');
  await expect(preview).toContainText('chart-run-a');
  await expect(page.locator('[data-component="overview-last-run"]')).toContainText('Cost data is unavailable');
  await expect(preview.getByRole('alert')).toHaveCount(0);
  // Run-data failure remains visible: excluding a lookup must not silence the row source.
  await page.route(/\/projection\/.*delegation\.decisions\.v1(?:\?|$)/, route => route.fulfill({ status: 503, body: '{}' }));
  await page.reload();
  await expect(preview.getByRole('alert')).toContainText('Run data is unavailable');
});

test('all eleven destinations have matching icons, browser titles and a single page heading', async ({ page }, info) => {
  const pages = [
    ['overview','Overview'],['runs','Runs'],['workflow','Workflow'],['usage','Usage'],
    ['credentials','Credentials'],['api-keys','API Keys'],['delegation-evidence','Delegation Evidence'],
    ['experiments','Experimentation'],['agent-workbench','Agent Workbench'],['event-bus','Event Bus'],['lab','Lab'],
  ];
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [path, title] of pages) {
    await page.goto('/' + path);
    await expect(page.locator('main h1')).toHaveCount(1);
    await expect(page.locator('main')).not.toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('.main')).not.toContainText(/Loading/);
    await expect(page.locator('main h1')).toContainText(title);
    await expect(page).toHaveTitle(`${title} · OmniDash`);
    await expect(page.locator('main :is(.local-dashboard-page-icon, .ev-title-icon) svg')).toHaveCount(1);
    expect(await page.locator('main :is(.local-dashboard-page-icon, .ev-title-icon) svg').getAttribute('class')).toContain('lucide');
    await page.screenshot({ path: info.outputPath(`${path}-professional.png`) });
  }
});

test('Evidence uses readable sentence-case section headings and preserves routing and quality values', async ({ page }) => {
  await page.goto('/delegation-evidence');
  for (const name of ['Selected run','Model routing','Quality gate','Savings vs cloud baseline','Token usage','Recent delegations']) {
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  }
  await expect(page.locator('[data-panel-title="MODEL ROUTING"]')).toContainText('model-a');
  await expect(page.locator('[data-panel-title="QUALITY GATE"]')).toContainText('75');
  expect(chartRows[prefix + 'delegation.quality-gate.v1']).toHaveLength(1);
});

test('Experimentation copy explains missing results without internal tickets or implementation notes', async ({ page }) => {
  await page.goto('/experiments');
  await expect(page.locator('.ev-root')).toBeVisible();
  await expect(page.locator('.main')).not.toContainText(/Loading/);
  await expect(page.locator('.src-tag').filter({ hasText: /^OMN-\d+$/ })).toHaveCount(0);
  await expect(page.locator('.main')).not.toContainText(/No fixture|No mock|node_projection_context_roi|context_roi_scores/);
  await expect(page.getByText('No context-ROI experiment output yet', { exact: true })).toBeVisible();
  await expect(page.getByText('Heatmap has no experiment scores yet', { exact: true })).toBeVisible();
});

test('phone page headers keep their status badge inside the visible content area', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/agent-workbench');
  await expect(page.locator('.ev-head-right')).toBeVisible();
  const edges = await page.locator('.ev-head-right').evaluate(el => ({
    left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right,
  }));
  expect(edges.left).toBeGreaterThanOrEqual(0);
  expect(edges.right).toBeLessThanOrEqual(320);
});
