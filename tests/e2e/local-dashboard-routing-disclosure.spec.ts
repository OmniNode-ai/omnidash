import { writeFileSync } from 'node:fs';
import { expect, test } from 'playwright/test';
import { serveCharts } from './omn21166-chart-fixtures';

// Failure modes: a decorative icon duplicates the disclosure marker; removing
// that icon also breaks mouse/keyboard toggling or hides the native open state.
// OMN-21166 part 18 AC120: the nested "Full routing breakdown" disclosure is removed (Runs shows the routing table
// directly), so the native-marker checks run on the one disclosure Runs keeps, its page-level "More analysis".
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', trace: 'on' });

for (const route of ['/overview', '/runs']) {
  test(route === '/overview' ? 'Overview carries no routing disclosure or breakdown link'
    : `routing disclosure uses its native marker and remains operable on ${route}`, async ({ page }, info) => {
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
    // OMN-21166 part 18 AC118: Runs keeps the routing breakdown inside its one closed page-level "More analysis".
    const summary = page.locator('summary').filter({ hasText: /^More analysis$/ });
    const details = page.locator('details.local-more--page').filter({ has: summary });
    await expect(summary).toHaveCount(1);
    await expect(details).toHaveCount(1);
    await expect(details).not.toHaveAttribute('open');
    await summary.click();
    await expect(details).toHaveAttribute('open', '');
    await summary.click();
    await expect(details).not.toHaveAttribute('open');
    await summary.press('Enter');
    await expect(details).toHaveAttribute('open', '');
    await summary.press('Enter');
    await expect(details).not.toHaveAttribute('open');
    await summary.press('Space');
    await expect(details).toHaveAttribute('open', '');
    await expect(summary.locator('svg')).toHaveCount(0);
    // The routing table is in view with the disclosure open, with no second disclosure to open first.
    await expect(details.getByRole('region', { name: 'Tier mix', exact: true }).getByRole('table')).toBeVisible();
    await page.screenshot({ path: info.outputPath('routing-disclosure.png'), fullPage: true });
    writeFileSync(info.outputPath('receipt.json'), JSON.stringify({ route, decorativeIcons: await summary.locator('svg').count(), mouse: true, enter: true, space: true, nativeOpenState: true }, null, 2));
  });
}
