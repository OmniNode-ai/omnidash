import { writeFileSync } from 'node:fs';
import { expect, test } from 'playwright/test';
import { serveCharts } from './omn21166-chart-fixtures';

// Failure modes: a decorative icon duplicates the disclosure marker; removing
// that icon also breaks mouse/keyboard toggling or hides the native open state.
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', trace: 'on' });

for (const route of ['/overview', '/runs']) {
  test(`routing disclosure uses its native marker and remains operable on ${route}`, async ({ page }, info) => {
    await serveCharts(page);
    await page.goto(route);
    if (route === '/overview') {
      // OMN-21166 Maple grid: Overview's Tier mix is ranked bars with a link; the full routing breakdown disclosure
      // lives on Runs, so Overview has none of its own and reaches it through that link.
      await expect(page.locator('summary').filter({ hasText: 'Full routing breakdown' })).toHaveCount(0);
      await page.getByRole('link', { name: /View routing breakdown/ }).click();
      await expect(page).toHaveURL(/\/runs/);
    }
    // OMN-21166 part 13: Runs keeps the routing breakdown inside its closed page-level "More analysis".
    await page.locator('summary').filter({ hasText: /^More analysis$/ }).click();
    const summary = page.locator('summary').filter({ hasText: 'Full routing breakdown' });
    const details = page.locator('details.local-routing-details').filter({ has: summary });
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
    await summary.press('Space');
    await expect(details).not.toHaveAttribute('open');
    await expect(summary.locator('svg')).toHaveCount(0);
    await page.screenshot({ path: info.outputPath('routing-disclosure.png'), fullPage: true });
    writeFileSync(info.outputPath('receipt.json'), JSON.stringify({ route, decorativeIcons: await summary.locator('svg').count(), mouse: true, enter: true, space: true, nativeOpenState: true }, null, 2));
  });
}
