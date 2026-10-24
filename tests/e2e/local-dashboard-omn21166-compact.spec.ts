import { revealRunFields } from './omn21166-chart-fixtures';
import { writeFileSync } from 'node:fs';
import { expect, test } from 'playwright/test';
import { serveCharts } from './omn21166-chart-fixtures';

test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', trace: 'on' });
test.beforeEach(async ({page}) => { await serveCharts(page); });

test('fresh application opens light with a visible heading and compact four-metric summary', async ({page},info) => {
  await page.goto('/overview');
  await expect(page.locator('body')).toHaveClass(/theme-light/);
  const title=page.getByRole('heading',{name:'Overview',exact:true});
  await expect(title).toBeVisible();
  const titleBox=await page.locator('.local-dashboard-title').boundingBox();
  expect(titleBox!.width).toBeGreaterThan(200);
  const summary=page.getByRole('region',{name:'Runtime summary',exact:true});
  await expect(summary.locator('[data-component]')).toHaveCount(4);
  expect((await summary.boundingBox())!.height).toBeLessThanOrEqual(160);
  await expect(summary).toContainText('Not measured');
  await expect(page.getByRole('link',{name:'Explore runs',exact:true})).toHaveAttribute('href','/runs');
  await page.screenshot({path:info.outputPath('compact-overview.png')});
});

test('secondary figures stay accessible by keyboard and last run retains exact served details', async ({page},info) => {
  await page.goto('/overview');
  const summary=page.locator('summary').filter({hasText:'Additional runtime metrics'});
  await summary.press('Enter');
  await expect(page.locator('[data-component="overview-compression"]')).toBeVisible();
  await expect(page.locator('[data-component="overview-quality"]')).toContainText('6');
  const last=page.locator('[data-component="overview-last-run"]');
  await expect(last.getByRole('link',{name:'chart-run-a',exact:true})).toHaveAttribute('href','/workflow?correlation_id=chart-run-a');
  await expect(last).toContainText('813 ms');
  await last.locator('summary').press('Enter');
  for(const label of ['Tokens in','Tokens out','Quality score','Task type','Route tier','Host','Basis']) await expect(last.getByText(label,{exact:true})).toBeVisible();
  await expect(last).not.toContainText('Request → Route → Quality');
  await page.screenshot({path:info.outputPath('compact-required-details.png')});
});

test('quality and latest run have separate full-width rows; D2 spend remains accessible in its disclosure', async ({page}) => {
  await page.goto('/overview');
  const focus=page.getByRole('region',{name:'Delegation quality',exact:true});
  const quality=focus.locator('[data-component="overview-quality"]');
  const latest=focus.locator('[data-component="overview-last-run"]');
  await expect(quality).toBeVisible(); await expect(latest).toBeVisible();
  const q=await quality.boundingBox(), r=await latest.boundingBox();
  expect(r!.y).toBeGreaterThanOrEqual(q!.y + q!.height);
  expect(Math.abs(q!.x-r!.x)).toBeLessThan(2);
  expect(q!.width).toBeGreaterThan(300); expect(r!.width).toBeGreaterThan(300);
  await page.getByText('Additional runtime metrics',{exact:true}).press('Enter');
  await expect(page.locator('[data-component="overview-spend-by-day"]')).toBeVisible();
  await expect(page.locator('[data-component="overview-tier-mix"]')).toContainText('8');
  await expect(page.locator('[data-component="overview-recent-runs"] th')).toHaveCount(16);
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

test('compact layout retains fields and fits narrow viewports', async ({page},info) => {
  const captures=[];
  for(const width of [390,320]) {
    await page.setViewportSize({width,height:844});
    await page.goto('/overview');
    await expect(page.getByRole('region',{name:'Runtime summary',exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.locator('summary').filter({hasText:'Additional runtime metrics'}).click();
    await expect(page.locator('[data-component="overview-baseline-spend"]')).toBeVisible();
    await page.getByText('Show recent run fields',{exact:true}).press('Enter');
    await revealRunFields(page);
    const recent=page.locator('.local-recent-runs-wrap');
    expect(await recent.locator('tbody td').first().evaluate(el=>el.getBoundingClientRect().width)).toBeGreaterThanOrEqual(140);
    expect(await recent.evaluate(el=>[...el.querySelectorAll('td')].filter(c=>c.scrollWidth>c.clientWidth+1).length)).toBe(0);
    await page.screenshot({path:info.outputPath(`compact-${width}.png`),fullPage:true});
    captures.push({width,source:'declared served fixtures',url:page.url()});
  }
  writeFileSync(info.outputPath('compact-manifest.json'),JSON.stringify(captures,null,2));
});

test('recent runs keep six readable columns and native access to every served field', async ({page},info) => {
  await page.goto('/overview');
  const recent=page.locator('[data-component="overview-recent-runs"]');
  await recent.getByText('Show recent run fields',{exact:true}).press('Enter');
  await expect(recent.locator('th')).toHaveText(['Time','Run','Status','Model','Cost','Duration','Age','Cause','Task type','Backend','Host','Tokens in','Tokens out','Basis','Route tier','Quality score']);
  await expect(recent.getByRole('columnheader')).toHaveCount(6);
  const allFields=recent.getByRole('checkbox',{name:'Show all run fields',exact:true});
  await allFields.press('Space');
  await expect(allFields).toBeChecked();
  await expect(recent.getByRole('columnheader')).toHaveCount(16);
  const wrap=recent.locator('.local-dashboard-table-wrap');
  expect(await wrap.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(recent.locator(':scope > .local-recent-footer').getByRole('link',{name:'View all runs',exact:true})).toHaveAttribute('href','/runs');
  await page.screenshot({path:info.outputPath('recent-full-fields.png')});
});
