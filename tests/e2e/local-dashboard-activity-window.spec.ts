import { writeFileSync } from 'node:fs';
import { expect, test } from 'playwright/test';
import { serveCharts } from './omn21166-chart-fixtures';

// Before the control redesign: all presets share one colour; native date inputs
// run into their labels/presets; narrow layouts clip; keyboard selection or
// date validation can regress when presentation markup changes.
// Live review 2026-10-25 ("unified"): one radiogroup, named by each option's full accessible name.
const names = ['All time', 'Today (UTC)', 'Last 7 days (UTC)', 'Last 15 days (UTC)', 'Last 30 days (UTC)'];
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', trace: 'on' });

test('Activity window presets have distinct identities and a selected outline in both themes', async ({ page }, info) => {
  await serveCharts(page);
  await page.goto('/overview');
  // Live review 2026-10-25 ("unified"): the presets are the header's one window control, a radiogroup named
  // "Figures for" that drives the cards and the charts together.
  const group = page.getByRole('radiogroup', { name: 'Figures for', exact: true });
  await expect(group).toBeVisible();
  const results = [];
  for (const theme of ['light', 'dark']) {
    if ((await page.locator('html').getAttribute('data-theme') === 'dark' ? 'dark' : 'light') !== theme) {
      await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
    }
    // OMN-21166 part 11/Maple grid: the presets are one monochrome segmented control, not five coloured chips. The
    // selected one is the filled segment; the check is that exactly one is pressed, it reads differently from the
    // others, and every state keeps 4.5:1 text contrast. (Per-preset colour identity and the 2px outline were the old
    // chip treatment and no longer exist.)
    const colours = [];
    for (const name of names) colours.push(await group.getByRole('radio', { name, exact: true }).evaluate(el => getComputedStyle(el).color));
    const measure = (el: Element) => {
      const css = getComputedStyle(el);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d')!;
      // OMN-21166 live review 2026-10-25: a selected segment's fill is now translucent (colour-mix over the panel), so a
      // colour is composited over the opaque surface behind it before its luminance is read; reading the unblended
      // channels of a translucent fill gave a false 1.2:1.
      let surface = 'rgb(255, 255, 255)';
      for (let node: Element | null = el.parentElement; node; node = node.parentElement) {
        const own = getComputedStyle(node).backgroundColor;
        context.clearRect(0, 0, 1, 1); context.fillStyle = own; context.fillRect(0, 0, 1, 1);
        if (context.getImageData(0, 0, 1, 1).data[3] === 255) { surface = own; break; }
      }
      const luminance = (colour: string) => {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = surface;
        context.fillRect(0, 0, 1, 1);
        context.fillStyle = colour;
        context.fillRect(0, 0, 1, 1);
        const [r, g, b] = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map(value => {
          const s = value / 255;
          return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
        });
        return .2126 * r + .7152 * g + .0722 * b;
      };
      // The element's own fill is blended over the surface behind it; an unfilled segment is the surface itself.
      const backgroundColour = css.backgroundColor;
      const foreground = luminance(css.color), background = luminance(backgroundColour);
      return { background: css.backgroundColor, color: css.color,
        contrast: (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05) };
    };
    const selected = [];
    for (const name of names) {
      const button = group.getByRole('radio', { name, exact: true });
      await button.press('Enter');
      await expect(button).toHaveAttribute('aria-checked', 'true');
      await expect(group.locator('[role="radio"][aria-checked="true"]')).toHaveCount(1);
      // OMN-21166 live review 2026-10-25: the segments fade their fill on selection; measure after the fade has finished
      // (a mid-fade sample read a light fill under grey text on the dark theme, a false 3.9:1).
      await group.evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(animation => animation.finished)));
      const style = await button.evaluate(measure);
      expect(style.contrast, `${theme} ${name} selected text contrast`).toBeGreaterThanOrEqual(4.5);
      for (const other of names.filter(candidate => candidate !== name)) {
        const unselected = await group.getByRole('radio', { name: other, exact: true }).evaluate(measure);
        expect(unselected.contrast, `${theme} ${other} text contrast`).toBeGreaterThanOrEqual(4.5);
        expect(`${unselected.background}|${unselected.color}`, `${theme} ${name} selected reads differently from ${other}`).not.toBe(`${style.background}|${style.color}`);
      }
      selected.push({ name, ...style });
    }
    results.push({ theme, colours, selected });
    await page.screenshot({ path: info.outputPath(`window-presets-${theme}.png`) });
  }
  writeFileSync(info.outputPath('window-colours.json'), JSON.stringify(results, null, 2));
});

// Live review 2026-10-25 ("open the full calendar", "unified"): the start/end date fields were replaced by one month
// calendar in Overview's window control, which picks a single served or unserved UTC day (a reversed range can no
// longer be entered, so its message is gone). Kept from the old checks: the control fits every width with no page
// overflow, its targets are at least 40px, it is reachable and operable by keyboard, and picking a day drives the
// charts' window (the Runs per day population names that day).
for (const width of [1440, 390, 320]) {
  test(`calendar day picker at ${width}px fits, has 40px targets and works by keyboard`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await serveCharts(page);
    await page.goto('/overview');
    const calendar = page.getByRole('button', { name: /Pick a UTC day/ });
    await expect(calendar).toBeVisible();
    await calendar.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const layout = await dialog.evaluate(el => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, overflow: document.documentElement.scrollWidth - innerWidth,
        days: [...el.querySelectorAll<HTMLButtonElement>('.local-calendar-day')].map(b => b.getBoundingClientRect().height) };
    });
    writeFileSync(info.outputPath('calendar-layout.json'), JSON.stringify(layout, null, 2));
    expect(layout.overflow).toBeLessThanOrEqual(1);
    expect(layout.left).toBeGreaterThanOrEqual(0);
    expect(layout.right).toBeLessThanOrEqual(width);
    expect(Math.min(...layout.days)).toBeGreaterThanOrEqual(40);
    const day = dialog.getByRole('button', { name: /^Oct 17, 2026,/ });
    if (await day.count() === 0) await dialog.getByRole('button', { name: 'Previous month' }).click();
    await dialog.getByRole('button', { name: /^Oct 17, 2026,/ }).focus();
    await page.keyboard.press('Enter');
    await expect(dialog).toHaveCount(0);
    await expect(calendar).toContainText('Oct 17');
    await expect(page.getByTestId('insights-total')).toContainText('2026-10-17');
    await page.screenshot({ path: info.outputPath('calendar.png') });
  });
}
