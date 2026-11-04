import { writeFileSync } from 'node:fs';
import { expect, test } from 'playwright/test';
import { serveCharts } from './omn21166-chart-fixtures';

// Failure modes: a decorative icon duplicates the disclosure marker; removing
// that icon also breaks mouse/keyboard toggling or hides the native open state.
// OMN-22168: Runs' page-level disclosure is gone (nothing is folded away), so the Runs case now fails if any page-level
// fold returns or the routing tier table is not in view without one.
// OMN-21166 part 18 AC120: the nested "Full routing breakdown" disclosure is removed (Runs shows the routing table
// directly), so the native-marker checks run on the one disclosure Runs keeps, its page-level "More analysis".
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', trace: 'on' });

for (const route of ['/overview', '/runs']) {
  test(route === '/overview' ? 'Overview carries no routing disclosure or breakdown link'
    : `${route} shows the routing breakdown with no page-level disclosure`, async ({ page }, info) => {
    await serveCharts(page);
    await page.goto(route);
    // Neither page has the "Full routing breakdown" disclosure any more.
    await expect(page.locator('summary').filter({ hasText: 'Full routing breakdown' })).toHaveCount(0);
    await expect(page.locator('details.local-routing-details')).toHaveCount(0);
    if (route === '/overview') {
      // OMN-21166 Maple grid: Overview's Tier mix is ranked bars; the routing breakdown table lives on Runs. Part 15 AC96
      // removed the "View routing breakdown" link; Runs is in the sidebar.
      await expect(page.getByRole('link', { name: /View routing breakdown/ })).toHaveCount(0);
      await page.screenshot({ path: info.outputPath('routing-disclosure.png'), fullPage: true });
      writeFileSync(info.outputPath('receipt.json'), JSON.stringify({ route, fullRoutingBreakdownDisclosure: 0 }, null, 2));
      return;
    }
    // OMN-22168 (Lakshman 2026-11-05, "don't use this instead open all, no hide the contents"): Runs has no page-level
    // disclosure any more; the routing breakdown is its own panel, its tier table in view without opening anything.
    await expect(page.locator('details.local-more--page')).toHaveCount(0);
    await expect(page.locator('summary').filter({ hasText: /^More analysis$/ })).toHaveCount(0);
    const routing = page.getByRole('article', { name: 'Routing', exact: true });
    await expect(routing.getByRole('region', { name: 'Tier mix', exact: true }).getByRole('table')).toBeVisible();
    await page.screenshot({ path: info.outputPath('routing-disclosure.png'), fullPage: true });
    writeFileSync(info.outputPath('receipt.json'), JSON.stringify({ route, pageDisclosures: 0, tierTableInView: true }, null, 2));
  });
}
