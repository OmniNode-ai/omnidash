import { writeFileSync } from 'node:fs';
import { expect, test } from 'playwright/test';
import { serveCharts } from './omn21166-chart-fixtures';

test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', trace: 'on' });
test.beforeEach(async ({page}) => { await serveCharts(page); });

test('fresh application opens light with a visible heading and compact five-metric summary', async ({page},info) => {
  await page.goto('/overview');
  await expect(page.locator('body')).toHaveClass(/theme-light/);
  const title=page.getByRole('heading',{name:'Overview',exact:true});
  await expect(title).toBeVisible();
  const titleBox=await page.locator('.local-dashboard-title').boundingBox();
  expect(titleBox!.width).toBeGreaterThan(200);
  const summary=page.getByRole('region',{name:'Runtime summary',exact:true});
  // OMN-21166 live review 2026-10-25: Delegation Quality is the fifth headline card (was four).
  await expect(summary.locator('[data-component]')).toHaveCount(5);
  expect((await summary.boundingBox())!.height).toBeLessThanOrEqual(160);
  await expect(summary).toContainText('Not measured');
  // Live review 2026-10-25: the header's "Explore runs" button was removed.
  await expect(page.getByRole('link',{name:'Explore runs',exact:true})).toHaveCount(0);
  // OMN-21166 AC86 (Lakshman 2026-10-25): Recent runs (and its "View all runs" link) deleted from Overview.
  await expect(page.getByRole('link',{name:'View all runs'})).toHaveCount(0);
  await page.screenshot({path:info.outputPath('compact-overview.png')});
});

test('card details stay accessible by keyboard focus', async ({page},info) => {
  await page.goto('/overview');
  // OMN-21166 AC86 (Lakshman 2026-10-25): "Additional runtime metrics" and the last-run panel are deleted from Overview.
  // OMN-21166 live review 2026-10-25: the keyboard property retargets to the cards: focusing a card opens its served details.
  const quality=page.locator('[data-component="overview-quality"]');
  await expect(quality).toContainText('75.0%');
  // Part 29 AC191: the card's caption shows its basis under the figure; no popover and no About button.
  await expect(quality.locator('.local-card-caption')).toContainText('6 of 8 runs passed the quality gate');
  await expect(quality.locator('.local-card-caption > :first-child')).toBeVisible();
  await expect(quality.getByRole('button',{name:'About Delegation Quality',exact:true})).toHaveCount(0);
  await page.screenshot({path:info.outputPath('compact-required-details.png')});
});

test('quality is a headline card above the full-width rows; the tier mix stays on its own full-width row', async ({page}) => {
  await page.goto('/overview');
  // OMN-21166 live review 2026-10-25: Quality is the fifth card in the summary, not a Maple cell; the latest run,
  // Additional runtime metrics, Spend per day and Recent runs are deleted (AC86, Lakshman 2026-10-25).
  const quality=page.locator('.local-overview-summary [data-component="overview-quality"]');
  await expect(quality).toBeVisible();
  const tier=page.locator('.maple-grid [data-component="overview-tier-mix"]');
  await expect(tier).toBeVisible();
  const q=await quality.boundingBox(), r=await tier.boundingBox();
  expect(r!.y).toBeGreaterThanOrEqual(q!.y + q!.height);
  expect(q!.width).toBeGreaterThan(150); expect(r!.width).toBeGreaterThan(300);
  await expect(tier).toContainText('8');
});

test('an explicit dark preference survives reload and switching back to light works', async ({page}) => {
  await page.goto('/runs');
  await page.getByRole('button',{name:'Toggle theme',exact:true}).click();
  await expect(page.locator('body')).toHaveClass(/theme-dark/);
  await page.reload();
  await expect(page.locator('body')).toHaveClass(/theme-dark/);
  await page.getByRole('button',{name:'Toggle theme',exact:true}).click();
  await expect(page.locator('body')).toHaveClass(/theme-light/);
});

test('compact layout fits narrow viewports', async ({page},info) => {
  const captures=[];
  for(const width of [390,320]) {
    await page.setViewportSize({width,height:844});
    await page.goto('/overview');
    await expect(page.getByRole('region',{name:'Runtime summary',exact:true})).toBeVisible();
    // OMN-21166 AC86 (Lakshman 2026-10-25): Additional runtime metrics and Recent runs deleted from Overview; the
    // no-overflow property stays on the surviving cards and charts.
    await expect(page.locator('[data-component="overview-tier-mix"]')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect(await page.evaluate(()=>[...document.querySelectorAll('.local-overview-summary article')].filter(c=>c.scrollWidth>c.clientWidth+1).length)).toBe(0);
    await page.screenshot({path:info.outputPath(`compact-${width}.png`),fullPage:true});
    captures.push({width,source:'declared served fixtures',url:page.url()});
  }
  writeFileSync(info.outputPath('compact-manifest.json'),JSON.stringify(captures,null,2));
});
