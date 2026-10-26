import { expect, test } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

test.use({ viewport: { width: 1440, height: 900 }, trace: 'on', reducedMotion: 'reduce' });
// Failure modes: identical undifferentiated cards, iconless headings, lost controls/data,
// inconsistent directional meanings, cramped headers and mobile page overflow.
// OMN-21166 part 26: the two Settings sections share a path, so their screenshots keep the section in the name.
const shotName = (path: string) => path.startsWith('/settings') ? path.slice(1).replace(/[?=]/g, '-') : path.split('?')[0]!.slice(1);
for (const theme of ['light', 'dark'] as const) {
test(`organized cards across all seven MVP pages in ${theme}`, async ({ page }, info) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.addInitScript(value => localStorage.setItem('omnidash.theme.v1', value), theme);
    // A return visit with no newer rows should not occupy a notification banner.
    await page.addInitScript(() => localStorage.setItem('omnidash.overview.last-visit', String(Date.UTC(2100, 0, 1))));
    await serveCharts(page, { ...chartRows, [prefix + 'cost.savings-overview.v1']: [{
      window: 'all', captured_at: '2026-10-22T10:00:00Z', total_cost_usd: '3.5923', total_savings_usd: '1074.2157',
      run_count: 59188, tokens_total: 309271491, tokens_input: 300000001, tokens_output: 9271490,
    }] });
    for (const path of ['/overview', '/runs', '/workflow?correlation_id=chart-run-a', '/usage', '/settings?section=credentials', '/settings?section=api-keys', '/delegation-evidence']) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(path);
      await expect(page.getByRole('heading', {level:1})).toHaveCount(1);
      for (const label of ['Detailed activity analysis', 'Show run analysis', 'Additional runtime metrics']) {
        const summary = page.locator('summary').filter({ hasText: new RegExp(`^${label}$`) });
        if (await summary.isVisible() && await summary.locator('..').getAttribute('open') === null) {
          await summary.press('Enter');
          await expect(summary.locator('..')).toHaveAttribute('open', '');
        }
      }
      await expect(page.locator('body')).toHaveClass(new RegExp(`\\btheme-${theme}\\b`));
      await expect(page.getByText('Local runtime · HTTP', { exact: true })).toHaveCount(0);
      await expect(page.getByText(/Hover or tab through/)).toHaveCount(0);
      await expect(page.getByText('Latest five returned runs', { exact: true })).toHaveCount(0);
      if (path === '/overview') await expect(page.getByRole('status', { name: 'Since your last visit' })).toHaveCount(0);
      const activeNav = page.locator('.sidebar .mvp-nav-item.active');
      const activeBackground = theme === 'dark' ? 'rgb(32, 46, 73)' : 'rgb(238, 243, 255)';
      await expect(activeNav).toHaveCSS('background-color', activeBackground);
      await activeNav.hover();
      await expect(activeNav).toHaveCSS('background-color', activeBackground);
      await expect(activeNav.locator('.dash-marker')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      const cards = page.locator('.local-dashboard-panel, .ev-root .panel');
      await expect(cards.first()).toBeVisible();
      const accents = await cards.evaluateAll(elements => elements.map(el => ({
        width: parseFloat(getComputedStyle(el).borderTopWidth), color: getComputedStyle(el).borderTopColor,
        background: getComputedStyle(el).backgroundColor,
        image: getComputedStyle(el).backgroundImage,
        headline: el.closest('.local-overview-summary') !== null,
      })));
      // Live review 2026-10-25 ("each card different color"): the headline cards wear their identity colour as a 3px top
      // edge, each a different colour, on Overview and (part 15 AC91) on Runs, Usage and Evidence; every other card keeps
      // the single subtle 1px border.
      expect(accents.filter(card => !card.headline).every(card => card.width === 1), 'Cards use a single subtle border').toBe(true);
      const headlines = accents.filter(card => card.headline);
      if (headlines.length > 0) {
        expect(headlines.every(card => card.width === 3), 'Headline cards carry a 3px identity edge').toBe(true);
        expect(new Set(headlines.map(card => card.color)).size, 'Each headline card has its own colour').toBe(headlines.length);
      }
      expect(accents.every(card => card.image === 'none'), 'Cards use flat surfaces, without decorative gradients').toBe(true);
      const nestedSurfaces = page.locator('.local-run-summary-group, .workflow-analysis-card, .workflow-flow-node, .local-chart.ins-card, .usage-insight');
      const nestedStyles = await nestedSurfaces.evaluateAll(elements => elements.map(el => ({
        image: getComputedStyle(el).backgroundImage,
        shadow: getComputedStyle(el).boxShadow,
      })));
      expect(nestedStyles.every(card => card.image === 'none' && card.shadow === 'none'), 'Nested panels are also plain').toBe(true);
      const visibleNested = nestedSurfaces.filter({visible:true});
      if (await visibleNested.count()) {
        await visibleNested.first().hover();
        await expect(visibleNested.first()).toHaveCSS('box-shadow', 'none');
      }
      if (path === '/overview') {
        // OMN-21166 live review 2026-10-25: the five headline cards each wear their own edge colour (asserted above), so the
        // old "first four cards share one border colour" check is replaced by the count. Under this snapshot
        // (cost.savings-overview) source the Tokens card still keeps its two direction figures in view.
        expect(headlines.length, 'Five headline cards').toBe(5);
        await expect(page.locator('[data-component="overview-tokens"] .local-token-direction')).toHaveCount(2);
        await expect(page.locator('[data-component="overview-spend"] .local-dashboard-metric')).toHaveText('$3.59');
      }
      // Complex content gets its own row; metric headlines may stay compact.
      const spaciousLayouts = page.locator('.local-overview-focus, .local-run-charts, .workflow-analysis-grid, .workflow-record-grid, .usage-insight-grid, .ev-selected-run-layout, .ev-align-start');
      for (const layout of await spaciousLayouts.all()) {
        if (!await layout.isVisible()) continue;
        const widths = await layout.evaluate(element => ({
          available: element.clientWidth,
          cards: [...element.children].map(child => child.getBoundingClientRect().width),
        }));
        expect(widths.cards.every(width => Math.abs(width - widths.available) < 2), 'Each detailed card occupies a full row').toBe(true);
      }
      const panels = page.locator('.local-dashboard-panel');
      for (const panel of await panels.all()) {
        const icon = panel.locator(':scope > h2 svg');
        await expect(icon).toHaveCount(1);
        await expect(icon).toHaveCSS('padding', '0px');
        // OMN-21166 part 11/AC63: panel title icons are a 15px bare glyph; the KPI strip's label icons are 14px.
        await expect(icon).toHaveCSS('width', await panel.evaluate(el => el.parentElement?.matches('.local-overview-summary')) ? '14px' : '15px');
      }
      await page.screenshot({path:info.outputPath(`${shotName(path)}-${theme}-desktop.png`),fullPage:true});
      for (const width of [390,320]) {
        await page.setViewportSize({width,height:844});
        const collapse = page.getByRole('button', {name:'Collapse sidebar',exact:true});
        if (await collapse.isVisible()) await collapse.click();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      }
      await page.screenshot({path:info.outputPath(`${shotName(path)}-${theme}-mobile.png`),fullPage:true});
    }
  });
}
