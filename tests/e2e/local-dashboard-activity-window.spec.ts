import { writeFileSync } from 'node:fs';
import { expect, test } from 'playwright/test';
import { serveCharts } from './omn21166-chart-fixtures';

// Before the control redesign: all presets share one colour; native date inputs
// run into their labels/presets; narrow layouts clip; keyboard selection or
// date validation can regress when presentation markup changes.
const names = ['All', '1 day', '7 days', '15 days', '30 days'];
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', trace: 'on' });

test('Activity window presets have distinct identities and a selected outline in both themes', async ({ page }, info) => {
  await serveCharts(page);
  await page.goto('/overview');
  const group = page.getByRole('group', { name: 'Activity window', exact: true });
  await expect(group).toBeVisible();
  const results = [];
  for (const theme of ['light', 'dark']) {
    if ((await page.locator('html').getAttribute('data-theme') === 'dark' ? 'dark' : 'light') !== theme) {
      await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
    }
    const colours = [];
    for (const name of names) colours.push(await group.getByRole('button', { name, exact: true }).evaluate(el => getComputedStyle(el).color));
    expect(new Set(colours).size, `${theme} preset identities`).toBe(names.length);
    const selected = [];
    for (const name of names) {
      const button = group.getByRole('button', { name, exact: true });
      await button.press('Enter');
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      await expect(group.locator('button[aria-pressed="true"]')).toHaveCount(1);
      const style = await button.evaluate(el => {
        const css = getComputedStyle(el);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const context = canvas.getContext('2d')!;
        const luminance = (colour: string) => {
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = colour;
          context.fillRect(0, 0, 1, 1);
          const [r, g, b] = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map(value => {
            const s = value / 255;
            return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
          });
          return .2126 * r + .7152 * g + .0722 * b;
        };
        const foreground = luminance(css.color), background = luminance(css.backgroundColor);
        return { background: css.backgroundColor, outline: css.outlineStyle, width: parseFloat(css.outlineWidth),
          contrast: (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05) };
      });
      expect(style.contrast, `${theme} ${name} text contrast`).toBeGreaterThanOrEqual(4.5);
      expect(style.outline).not.toBe('none');
      expect(style.width).toBeGreaterThanOrEqual(2);
      selected.push({ name, ...style });
    }
    expect(new Set(selected.map(item => item.background)).size).toBe(names.length);
    results.push({ theme, colours, selected });
    await page.screenshot({ path: info.outputPath(`window-presets-${theme}.png`) });
  }
  writeFileSync(info.outputPath('window-colours.json'), JSON.stringify(results, null, 2));
});

for (const width of [1440, 390, 320]) {
  test(`custom date controls at ${width}px have separate labels, spacing and keyboard access`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await serveCharts(page);
    await page.goto('/overview');
    const group = page.getByRole('group', { name: 'Activity window', exact: true });
    await expect(group).toBeVisible();
    const first = group.getByLabel('Start date (UTC)', { exact: true });
    const last = group.getByLabel('End date (UTC)', { exact: true });
    const boxes = await group.evaluate(el => {
      const rect = (node: Element) => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
      const dates = [...el.querySelectorAll<HTMLInputElement>('input[type="date"]')].map(input => {
        const label = input.closest('label')!;
        const range = document.createRange();
        range.selectNodeContents(label.querySelector('span') ?? label.firstChild!);
        const r = range.getBoundingClientRect();
        return { name: input.getAttribute('aria-label'), input: rect(input), label: { x: r.x, y: r.y, right: r.right, bottom: r.bottom } };
      });
      return { dates, presets: [...el.querySelectorAll('button')].map(rect), viewport: innerWidth,
        overflow: document.documentElement.scrollWidth - innerWidth };
    });
    writeFileSync(info.outputPath('date-layout.json'), JSON.stringify(boxes, null, 2));
    expect(boxes.dates).toHaveLength(2);
    expect(boxes.presets).toHaveLength(5);
    expect(boxes.overflow).toBeLessThanOrEqual(1);
    for (const date of boxes.dates) {
      expect(date.input.y - date.label.bottom, date.name ?? '').toBeGreaterThanOrEqual(6);
      expect(date.input.height).toBeGreaterThanOrEqual(40);
      expect(date.input.x).toBeGreaterThanOrEqual(0);
      expect(date.input.right).toBeLessThanOrEqual(width);
      for (const tab of boxes.presets) {
        const overlap = date.input.x < tab.right && date.input.right > tab.x && date.input.y < tab.bottom && date.input.bottom > tab.y;
        expect(overlap, `${date.name} must not overlap a preset`).toBe(false);
      }
    }
    await group.getByRole('button', { name: '30 days', exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(first).toBeFocused();
    for (let index = 0; index < 6 && !await last.evaluate(el => el === document.activeElement); index++) await page.keyboard.press('Tab');
    await expect(last).toBeFocused();
    await first.fill('2026-10-17');
    await last.fill('2026-10-17');
    const insights = page.getByRole('group', { name: 'Insights', exact: true }).filter({ has: group });
    await expect(insights.getByTestId('insights-total')).toContainText('2026-10-17 through 2026-10-17 UTC');
    await last.fill('2026-10-16');
    await expect(insights.getByRole('status', { name: 'Insights', exact: true })).toHaveText('End date must be on or after the start date');
    await page.screenshot({ path: info.outputPath('date-controls.png') });
  });
}
