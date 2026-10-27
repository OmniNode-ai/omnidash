import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from 'playwright/test';
import { PAGE_LABELS, PAGE_PATHS } from '../../src/navigation/page-routes';
import type { AppPage } from '../../src/store/types';
import { chartRows, prefix, revealRunFields, serveCharts } from './omn21166-chart-fixtures';

// Failure modes, before the style change: shared navigation is omitted; compact
// table/metadata/SVG text stays too small; mobile generated labels are missed;
// hidden text produces false alarms; a loading/error page gives a vacuous pass.
// These governed response fixtures prove rendering, not a live producer write.
const destinations: AppPage[] = [
  'local-overview', 'local-runs', 'local-workflow', 'local-usage',
  'local-settings', 'delegation-evidence',
  'experiments', 'sea-control', 'event-bus', 'lab',
];
const visits = destinations.map(destination => ({ destination,
  suffix: destination === 'local-workflow' ? '?correlation_id=chart-run-a' : '', label: PAGE_LABELS[destination] }));
const rows = { ...chartRows, [prefix + 'topic-activity.v1']: [{
  topic: 'onex.evt.readability.sample.v1', sampled_at: '2026-10-17T10:00:00Z',
  retained_messages: 1234, messages_last_hour: 12, messages_last_24h: 1234,
  rate_per_second: 0, activity_state: 'UNKNOWN', projection_cursor: 'readability',
}] };

async function scanText(page: Page) {
  return page.locator('body').evaluate(body => {
    const readings: { text: string; size: number; element: string }[] = [];
    const visible = (el: Element) => {
      if (el.closest('script,style,template,.sr-only')) return false;
      return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    };
    const record = (el: Element, text: string, pseudo?: string) => {
      const css = getComputedStyle(el, pseudo);
      readings.push({ text: text.trim().slice(0, 100), size: parseFloat(css.fontSize),
        element: `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}${pseudo ?? ''}` });
    };
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode, el = node.parentElement;
      if (!el || !node.textContent?.trim() || !visible(el)) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      if (![...range.getClientRects()].some(rect => rect.width > 1 && rect.height > 1)) continue;
      record(el, node.textContent);
    }
    for (const el of body.querySelectorAll('*')) {
      if (!visible(el)) continue;
      for (const pseudo of ['::before', '::after']) {
        const css = getComputedStyle(el, pseudo);
        if (css.display === 'none' || css.visibility === 'hidden') continue;
        const content = css.content.startsWith('attr(')
          ? el.getAttribute(css.content.slice(5, -1)) ?? '' : css.content.replace(/^['"]|['"]$/g, '');
        if (content.trim() && !['none', 'normal'].includes(content)) record(el, content, pseudo);
      }
      if (el instanceof HTMLInputElement && !['checkbox', 'radio', 'hidden'].includes(el.type)) {
        const text = el.value || el.placeholder;
        if (text.trim()) record(el, text);
      }
    }
    return { checked: readings.length, minimum: Math.min(...readings.map(item => item.size)),
      small: readings.filter(item => item.size < 12) };
  });
}

test.use({ reducedMotion: 'reduce', trace: 'on' });

test('font scanner detects planted 10px HTML, SVG and generated text, ignores hidden text and accepts 12px', async ({ page }, info) => {
  await page.setContent(`<style>.generated::before { content: 'small generated'; font-size: 10px }</style>
    <p style="font-size:10px">small HTML</p><p style="font-size:12px">readable control</p>
    <p style="display:none;font-size:10px">hidden control</p>
    <svg width="200" height="40"><text x="0" y="20" style="font-size:10px">small SVG</text></svg>
    <div class="generated"></div>`);
  const result = await scanText(page);
  expect(result.small.map(item => item.text).sort()).toEqual(['small HTML', 'small SVG', 'small generated'].sort());
  expect(result.checked).toBe(4);
  writeFileSync(info.outputPath('scanner-controls.json'), JSON.stringify(result, null, 2));
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  for (const { destination, suffix, label } of visits) {
    test(`${label} at ${viewport.width}x${viewport.height} has no visible text below 12px`, async ({ page }, info) => {
      await page.setViewportSize(viewport);
      await serveCharts(page, rows);
      await page.goto(PAGE_PATHS[destination] + suffix);
      await expect(page.locator('.breadcrumbs .cur')).toHaveText(PAGE_LABELS[destination]);
      await expect(page.locator('main')).not.toHaveAttribute('aria-busy', 'true');
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('.main')).not.toContainText(/Dashboard is unavailable|Loading/);
      // OMN-21166 AC86 (Lakshman 2026-10-25): Recent runs and its field view are deleted from Overview; only Runs has them.
      if (destination === 'local-runs') await revealRunFields(page);
      if (destination === 'lab') await expect(page.getByTestId('topic-activity-row')).toHaveCount(1);
      // Exercise rendered disclosures, including fields that are hidden at rest.
      for (const disclosure of await page.locator('main details').all()) {
        if (await disclosure.isVisible() && await disclosure.getAttribute('open') === null) {
          await disclosure.locator(':scope > summary').press('Enter');
        }
      }
      const results = [];
      for (const theme of ['light', 'dark']) {
        if ((await page.locator('html').getAttribute('data-theme') === 'dark' ? 'dark' : 'light') !== theme) {
          await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
        }
        await expect(page.locator('body')).toHaveClass(new RegExp(`theme-${theme}`));
        for (const developer of [false, true]) {
          const toggle = page.getByRole('checkbox', { name: 'Show developer tools', exact: true });
          if (await toggle.getAttribute('aria-checked') !== String(developer)) await toggle.click();
          await expect(toggle).toHaveAttribute('aria-checked', String(developer));
          const result = await scanText(page);
          expect(result.checked, 'positive rendered-text control alongside the loaded page heading').toBeGreaterThan(0);
          results.push({ destination, path: PAGE_PATHS[destination] + suffix, viewport, theme, developer, ...result });
          await page.screenshot({ path: info.outputPath(`${theme}-developer-${developer}.png`), fullPage: true });
        }
      }
      writeFileSync(info.outputPath('font-census.json'), JSON.stringify({
        data: 'governed response fixtures; no live-data claim', results,
      }, null, 2));
      expect(results.flatMap(result => result.small.map(item => ({ theme: result.theme, developer: result.developer, ...item })))).toEqual([]);
    });
  }
}
