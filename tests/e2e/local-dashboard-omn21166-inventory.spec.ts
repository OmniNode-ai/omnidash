import { revealRunFields } from './omn21166-chart-fixtures';
import { writeFileSync } from 'node:fs';
import { sourceIdentity } from './source-identity';
import { expect, test } from 'playwright/test';
import { serveCharts } from './omn21166-chart-fixtures';

const routes = ['overview','runs','workflow','usage','credentials','api-keys','delegation-evidence','experiments','sea-control','event-bus','lab'];
test.use({ viewport: { width: 1440, height: 900 }, trace: 'on', reducedMotion: 'reduce' });
test.beforeEach(async ({ page }) => { await serveCharts(page); await page.emulateMedia({reducedMotion:'reduce'}); });

test('required field and control inventory stays available on every current page', async ({ page }, info) => {
  test.setTimeout(90000);
  const pages: Record<string, unknown> = {};
  for (const route of routes) {
    await page.goto('/' + route);
    await expect(page.locator('.breadcrumbs .cur')).not.toHaveText('');
    await expect(page.locator('.main')).not.toContainText(/Loading(?: runtime exposures| census|…|\.\.\.)/);
    if (route === 'runs') await revealRunFields(page);
    // OMN-21166 AC86 (Lakshman 2026-10-25): Overview has no Recent runs field view and no "Additional runtime metrics"
    // disclosure to open; everything it draws is in view on load.
    pages[route] = await page.evaluate(() => ({
      fields: [...document.querySelectorAll(location.pathname === '/runs' ? '[data-component="recent-runs"] th' : '.main th, .main dt, .main .kv .k, .main .k-l, .main .dt-head > div')]
        .map(el => el.textContent?.trim()).filter(Boolean),
      labels: [...document.querySelectorAll('.main label')].map(el => el.textContent?.trim()).filter(Boolean),
      headings: [...document.querySelectorAll('.main h1, .main h2, .main h3, .main .panel-h .pt')].map(el => el.textContent?.trim()).filter(Boolean),
      buttons: [...document.querySelectorAll<HTMLButtonElement>('.main button')].map(el => el.getAttribute('aria-label') ?? el.textContent?.trim()).filter(Boolean),
    }));
  }
  expect((pages.runs as { fields: string[] }).fields).toContain('Modelled saving');
  expect((pages.runs as { fields: string[] }).fields).toHaveLength(18);
  writeFileSync(info.outputPath('required-inventory.json'), JSON.stringify({
    ...sourceIdentity(),
    mode: 'served fixtures, no live runtime claim', pages,
  }, null, 2));
});

test('text contrast is measured on real rendered backgrounds in both themes', async ({ page }, info) => {
  test.setTimeout(90000);
  const results: Record<string, unknown>[] = [];
  for (const route of routes) {
    await page.goto('/' + route);
    await expect(page.locator('.breadcrumbs .cur')).not.toHaveText('');
    await expect(page.locator('.main')).not.toContainText(/Loading(?: runtime exposures| census|…|\.\.\.)/);
    if (route === 'runs') await revealRunFields(page);
    // OMN-21166 AC86 (Lakshman 2026-10-25): Overview has no Recent runs field view and no "Additional runtime metrics"
    // disclosure to open; everything it draws is in view on load.
    for (const theme of ['light','dark']) {
      if ((await page.locator('html').getAttribute('data-theme') === 'dark' ? 'dark' : 'light') !== theme) await page.getByRole('button',{name:'Toggle theme'}).click();
      await expect(page.locator('body')).toHaveClass(new RegExp(`theme-${theme}`));
      await page.evaluate(async () => {
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => undefined)));
      });
      const measured = await page.evaluate(() => {
        const ctx = document.createElement('canvas').getContext('2d')!;
        const rgba = (color: string) => {
          ctx.clearRect(0,0,1,1); ctx.fillStyle = color; ctx.fillRect(0,0,1,1);
          return [...ctx.getImageData(0,0,1,1).data].map((v,i) => i === 3 ? v/255 : v);
        };
        const blend = (fg: number[], bg: number[]) => fg.slice(0,3).map((value,i) => value*fg[3] + bg[i]*(1-fg[3]));
        const lum = (rgb: number[]) => rgb.slice(0,3).map(value => { const s=value/255; return s<=.04045?s/12.92:((s+.055)/1.055)**2.4; }).reduce((sum,value,i) => sum+value*[.2126,.7152,.0722][i],0);
        const walker = document.createTreeWalker(document.querySelector('.app')!,NodeFilter.SHOW_TEXT);
        const failures: Record<string, unknown>[] = [];
        let checked = 0;
        while (walker.nextNode()) {
          const node=walker.currentNode, el=node.parentElement!;
          const text=node.textContent?.trim();
          if (!text || el.closest('svg,option,script,style,[aria-hidden=true],button:disabled')) continue;
          const rect=el.getBoundingClientRect(), style=getComputedStyle(el);
          if (rect.width<=1 || rect.height<=1 || style.visibility==='hidden' || !el.getClientRects().length) continue;
          const parents: Element[]=[]; let parent: Element|null=el;
          while(parent) { parents.unshift(parent); parent=parent.parentElement; }
          let bg=[255,255,255], opacity=1;
          for(const item of parents) { const css=getComputedStyle(item); bg=blend(rgba(css.backgroundColor),bg); opacity*=Number(css.opacity); }
          if(opacity===0) continue;
          const foreground=rgba(style.color); foreground[3]*=opacity;
          const fg=blend(foreground,bg), l1=lum(fg),l2=lum(bg);
          const ratio=(Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05);
          const size=parseFloat(style.fontSize), weight=parseInt(style.fontWeight);
          const threshold=size>=24 || (weight>=700 && size>=18.66) ? 3 : 4.5;
          checked++;
          if(ratio+.02<threshold) failures.push({html:el.outerHTML,parent:el.parentElement?.outerHTML.slice(0,1500),text:text.slice(0,90),class:el.getAttribute('class'),ratio,threshold,color:style.color,foreground:fg,background:bg,opacity});
        }
        return {checked,failures,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,blackOnWhite:(lum(rgba('#ffffff'))+.05)/(lum(rgba('#000000'))+.05)};
      });
      results.push({route,theme,...measured});
    }
  }
  writeFileSync(info.outputPath('contrast.json'),JSON.stringify(results,null,2));
  expect(results.every(result => Number(result.checked)>10),'positive text-node control').toBe(true);
  expect(results.every(result => result.reducedMotion === true),'known reduced-motion control').toBe(true);
  expect(results.every(result => Math.abs(Number(result.blackOnWhite)-21)<.01),'known black/white contrast control').toBe(true);
  const failures=results.flatMap(result => (result.failures as unknown[]).map(failure => ({route:result.route,theme:result.theme,failure})));
  expect(failures.slice(0,20),`${failures.length} low-contrast text nodes; full record in contrast.json`).toEqual([]);
});

test('chart marks remain distinguishable against their actual surfaces', async ({ page }, info) => {
  const results: Record<string,unknown>[]=[];
  for (const route of ['overview','runs','usage']) {
    await page.goto('/'+route);
    await expect(page.locator('.main')).not.toContainText(/Loading(?: runtime exposures| census|…|\.\.\.)/);
    if (route === 'runs') await revealRunFields(page);
    // OMN-21166 AC86 (Lakshman 2026-10-25): Overview has no Recent runs field view and no "Additional runtime metrics"
    // disclosure to open; everything it draws is in view on load.
    for (const theme of ['light','dark']) {
      if ((await page.locator('html').getAttribute('data-theme') === 'dark' ? 'dark' : 'light') !== theme) await page.getByRole('button',{name:'Toggle theme'}).click();
      await expect(page.locator('body')).toHaveClass(new RegExp(`theme-${theme}`));
      await page.evaluate(async () => {
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => undefined)));
      });
      const marks=await page.evaluate(() => {
        const ctx=document.createElement('canvas').getContext('2d')!;
        const rgba=(color:string)=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].map((v,i)=>i===3?v/255:v);};
        const blend=(fg:number[],bg:number[])=>fg.slice(0,3).map((v,i)=>v*fg[3]+bg[i]*(1-fg[3]));
        const lum=(rgb:number[])=>rgb.slice(0,3).map(v=>{const s=v/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
        return [...document.querySelectorAll('.local-donut-slice,.usage-tokens-fill,.local-chart-swatch,.gdb-bar,.rb-bar:not([data-pattern="unknown"])')].map(el=>{
          const css=getComputedStyle(el), ancestors:Element[]=[];let p:Element|null=el.parentElement;
          while(p){ancestors.unshift(p);p=p.parentElement;}
          let bg=[255,255,255];for(const ancestor of ancestors)bg=blend(rgba(getComputedStyle(ancestor).backgroundColor),bg);
          // OMN-21166 live review 2026-10-25: Overview's marks are dotted grouped bars (.gdb-bar) and ranked bars (.rb-bar); both
          // are painted in currentColor (their colour property), the donut by its stroke, the rest by their fill.
          const color=el.matches('.local-donut-slice')?css.stroke:el.matches('.gdb-bar,.rb-bar')?css.color:css.backgroundColor;
          const fg=rgba(color), a=lum(fg),b=lum(bg);
          return {class:el.getAttribute('class'),color,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
        });
      });
      expect(marks.length,`${route} positive chart-mark control`).toBeGreaterThan(0);
      results.push({route,theme,marks});
    }
  }
  writeFileSync(info.outputPath('chart-contrast.json'),JSON.stringify(results,null,2));
  const failures=results.flatMap(row=>(row.marks as {ratio:number}[]).filter(mark=>mark.ratio+.02<3).map(mark=>({route:row.route,theme:row.theme,...mark})));
  expect(failures).toEqual([]);
});
