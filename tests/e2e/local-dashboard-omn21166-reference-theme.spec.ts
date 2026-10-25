import { expect, test } from 'playwright/test';
import { serveCharts } from './omn21166-chart-fixtures';

// Reference targets declared before CSS: warm canvas/card/inset separation,
// readable ordinary text, matching dark hierarchy, all routes and controls retained.
test.use({ viewport: { width: 1440, height: 900 }, trace: 'on' });
test.beforeEach(async ({ page }) => { await serveCharts(page); await page.emulateMedia({ reducedMotion: 'reduce' }); });

test('reference theme separates warm cards and inset plots without losing readable text', async ({ page }, info) => {
  await page.goto('/runs');
  // OMN-21166 part 13: the run charts sit under the closed "More run charts" disclosure; open it first.
  await page.getByText('More run charts', { exact:true }).press('Enter');
  const chart=page.getByRole('figure', { name:'Quality score per run', exact:true });
  await expect(chart.locator('svg').first()).toBeVisible();
  for (const theme of ['light','dark']) {
    if ((await page.locator('html').getAttribute('data-theme') === 'dark' ? 'dark' : 'light') !== theme) await page.getByRole('button', { name:'Toggle theme' }).click();
    const layers=await page.evaluate(() => {
      const root=getComputedStyle(document.documentElement);
      const canvas=document.createElement('canvas'); canvas.width=canvas.height=1;
      const ctx=canvas.getContext('2d')!;
      const rgb=(color:string)=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].slice(0,3);};
      const lum=(c:number[])=>c.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
      const bg=root.getPropertyValue('--panel').trim(), ink=root.getPropertyValue('--ink-2').trim();
      const l=[lum(rgb(bg)),lum(rgb(ink))].sort((a,b)=>b-a);
      return { canvas:root.getPropertyValue('--bg').trim(), card:bg, inset:root.getPropertyValue('--panel-2').trim(), contrast:(l[0]+.05)/(l[1]+.05) };
    });
    // OMN-21166 token palette (commit c8d5ab0f, Geist light/dark tokens): warm canvas, card and inset values moved.
    expect(layers.canvas).toBe(theme==='light'?'#fafaf9':'#121110');
    expect(layers.card).toBe(theme==='light'?'#ffffff':'#191817');
    expect(layers.card).not.toBe(layers.canvas);
    expect(layers.inset).not.toBe(layers.card);
    expect(layers.contrast).toBeGreaterThanOrEqual(4.5);
    await chart.scrollIntoViewIfNeeded();
    await page.screenshot({ path:info.outputPath(`reference-runs-${theme}.png`) });
  }
});

test('shared reference theme keeps all seven routes usable in light and dark', async ({ page }, info) => {
  for (const route of ['overview','runs','workflow','usage','credentials','api-keys','delegation-evidence']) {
    await page.goto('/'+route);
    await expect(page.locator('h1')).toBeVisible();
    for (const theme of ['light','dark']) {
      if ((await page.locator('html').getAttribute('data-theme') === 'dark' ? 'dark' : 'light') !== theme) await page.getByRole('button', { name:'Toggle theme' }).click();
      await expect(page.locator('body')).toHaveClass(new RegExp(`theme-${theme}`));
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
      await page.screenshot({path:info.outputPath(`${route}-${theme}.png`)});
    }
  }
});

// Closer image match: filled ochre navigation and a shared muted plot/legend palette.
test('navigation stays blue and outcome plots match their semantic legend', async ({ page }, info) => {
  await page.goto('/overview');
  if (await page.locator('html').getAttribute('data-theme') === 'dark') await page.getByRole('button', { name:'Toggle theme' }).click();
  const nav=page.getByRole('link', { name:'Overview', exact:true });
  await expect(nav).toHaveCSS('background-color','rgb(238, 243, 255)');
  await expect(nav.locator('.dash-name')).toHaveCSS('color','rgb(29, 78, 216)');
  const chart=page.getByRole('figure', { name:'Runs per day', exact:true });
  const passed=chart.getByRole('button', { name:'Passed', exact:true });
  await expect(passed).toHaveAttribute('aria-pressed','true');
  // OMN-21166 live review 2026-10-25: the dotted grouped bars are painted in currentColor (their colour property); their
  // background is no longer a solid fill, so the mark colour is read from `color`.
  const marks=()=>chart.locator('.gdb-col[data-series="passed"] .ins-seg').evaluateAll(els=>els.map(el=>getComputedStyle(el).color));
  const before=await marks();
  const passColor = await passed.evaluate(el => getComputedStyle(el, '::before').backgroundColor);
  expect(before.length).toBeGreaterThan(0);
  expect(before).toContain(passColor);
  await passed.click();
  expect(await marks()).toEqual([]);
  await passed.click();
  await expect(passed).toHaveAttribute('aria-pressed','true');
  await chart.scrollIntoViewIfNeeded();
  await page.screenshot({path:info.outputPath('nanomon-palette-light.png')});
});
