import { expect, test, type Locator } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

// Before implementation: the same field has different colors on each page;
// missing values look measured; metadata loses served zero/precision; shared
// colors become unreadable in one theme or expanded cards overflow on phones.
const run = { ...(chartRows[prefix + 'delegation.decisions.v1'][0] as object),
  backend_id: 'local-review', host: 'recorded-host', required_bar: '0.800',
  actual_score: '0.987654', cost_usd: '0.001234', queue_wait_ms: 0, execution_ms: 813 };
const rows = { ...chartRows, [prefix + 'delegation.decisions.v1']: [run],
  [prefix + 'delegation.correlation-trace.v1']: [run] };
const color = (locator: Locator) => locator.evaluate(el => getComputedStyle(el).color);
test.use({ viewport: { width: 1440, height: 900 }, trace: 'on' });

test('matching fields retain one distinct color across Overview, Workflow and Evidence', async ({ page }, info) => {
  await serveCharts(page, rows);
  // OMN-21166 AC86 (Lakshman 2026-10-25): Last run is deleted from Overview, so the Model identity is read from the
  // Workflow run summary; the token identities still come from Overview's Tokens per day legend.
  // OMN-21166 live review 2026-10-25 + seven-page look: values (dd, .v) are set in ink; a field's identity colour is
  // carried by its icon, so the cross-page match is checked on the icon colour and the values must agree in ink.
  await page.goto('/workflow?correlation_id=chart-run-a');
  const icon = (label: string) => color(page.locator(`[data-summary-field="${label}"] dt svg`));
  // Part 28a: the Model icon is the run's model identity (data, in its colour); a field's label icon is the one interface
  // grey on every page, and its colour stays on the data (the Tokens per day legend keeps tokens in and out distinct).
  const modelColor = await icon('Model');
  const grey = await icon('Tokens in');
  expect(await icon('Tokens out')).toBe(grey);
  await page.goto('/overview');
  const daily = page.getByRole('figure', { name: 'Tokens per day', exact: true });
  const legend = await Promise.all([color(daily.locator('.ins-token-legend [data-field-tone="tokens-in"]')), color(daily.locator('.ins-token-legend [data-field-tone="tokens-out"]'))]);
  expect(new Set(legend).size).toBe(2);
  expect(legend).not.toContain(grey);
  expect(modelColor).not.toBe(grey);
  const original = [modelColor, grey, grey];
  await page.goto('/workflow?correlation_id=chart-run-a');
  const inkValues: string[] = [];
  for (const [index, label] of ['Model', 'Tokens in', 'Tokens out'].entries()) {
    await expect(page.locator(`[data-summary-field="${label}"] dt svg`)).toHaveCSS('color', original[index]);
    inkValues.push(await color(page.locator(`[data-summary-field="${label}"] dd`)));
  }
  await expect(page.locator('[data-summary-field="Quality score"] dd')).toHaveText('0.987654');
  await page.goto('/delegation-evidence');
  const selected = page.locator('.panel').filter({ has: page.getByRole('heading', { name: 'Selected run', exact: true }) });
  const field = (name: string) => selected.locator('.kv > div').filter({ has: page.getByText(name, { exact: true }) });
  await expect(field('Model').locator('.v')).toHaveText('model-a');
  await expect(field('Model').locator('.k svg')).toHaveCSS('color', original[0]);
  await expect(field('Model').locator('.v')).toHaveCSS('color', inkValues[0]);
  for (const [index, label] of ['Tokens in', 'Tokens out'].entries()) {
    await expect(field(label).locator('.v')).toHaveText(index === 0 ? '162' : '52');
    await expect(field(label).locator('.k svg')).toHaveCSS('color', original[index + 1]);
    await expect(field(label).locator('.v')).toHaveCSS('color', inkValues[index + 1]);
  }
  await page.screenshot({ path: info.outputPath('uniform-evidence.png') });
});

test('Evidence keeps small recorded cost and input/output availability independently', async ({ page }, info) => {
  await serveCharts(page, { ...rows, [prefix + 'delegation.correlation-trace.v1']: [{ ...run, tokens_input: null, tokens_output: 0 }] });
  await page.goto('/delegation-evidence');
  const selected = page.locator('.panel').filter({ has: page.getByRole('heading', { name: 'Selected run', exact: true }) });
  const value = (name: string) => selected.locator('.kv > div').filter({ has: page.getByText(name, { exact: true }) }).locator('.v');
  await expect(value('Cost')).toHaveText('$0.01');
  await expect(value('Tokens in')).toHaveText('Not recorded');
  await expect(value('Tokens out')).toHaveText('0');
  await page.screenshot({ path: info.outputPath('uniform-precise-cost.png') });
});

test('zero remains measured and missing metadata is neutral instead of looking like a value', async ({ page }, info) => {
  await serveCharts(page, { ...rows, [prefix + 'delegation.decisions.v1']: [{ ...run, tokens_input: 0, tokens_output: null }] });
  await page.goto('/workflow?correlation_id=chart-run-a');
  const input = page.locator('[data-summary-field="Tokens in"] dd');
  const output = page.locator('[data-summary-field="Tokens out"] dd');
  await expect(input).toHaveText('0');
  await expect(output).toHaveText('Not recorded');
  expect(await color(input)).not.toBe(await color(output));
  await expect(page.locator('[data-summary-field="Quality score"] dd')).toHaveText('0.987654');
  await expect(page.locator('[data-summary-field="Required bar"] dd')).toHaveText('0.800');
  await page.screenshot({ path: info.outputPath('uniform-zero-missing.png') });
});

test('shared field colors stay readable in both themes with phone-safe expanded cards', async ({ page }, info) => {
  await serveCharts(page, rows);
  await page.goto('/overview');
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
  for (const route of ['overview', 'workflow?correlation_id=chart-run-a', 'delegation-evidence']) {
    await page.goto('/' + route);
    await expect(page.locator('[data-field-tone]').first()).toBeVisible();
    for (const theme of ['light', 'dark']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.getByRole('button', { name: 'Toggle theme' }).click();
      await page.setViewportSize({ width: 390, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      // OMN-21166 live review 2026-10-25: Overview has no dt/dd fields now; its tone-coloured text is the Tokens per day
      // legend and readout, so those are measured too.
      // Part 15 AC96: the readout is empty at rest and fills for the day a reader points at, so a day is focused first.
      if (route === 'overview') await page.getByRole('group', { name: 'Tokens per day', exact: true }).getByRole('button').last().focus();
      const contrasts = await page.locator('[data-field-tone] > dt, [data-field-tone] > dd, [data-field-tone] > .k, [data-field-tone] > .v, .ins-token-legend > [data-field-tone], .ins-readout > [data-field-tone]').evaluateAll(els => {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d')!;
        const rgb = (s: string) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = s; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data]; };
        const lum = (c: number[]) => c.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
        return els.filter(el => el.getBoundingClientRect().height > 0).map(el => {
          let parent: Element | null = el, bg = 'white';
          while (parent) { const candidate = getComputedStyle(parent).backgroundColor; if (rgb(candidate)[3] > 0) { bg = candidate; break; } parent = parent.parentElement; }
          const a = lum(rgb(getComputedStyle(el).color)), b = lum(rgb(bg));
          return { text: el.textContent, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
        });
      });
      expect(contrasts.length).toBeGreaterThan(3);
      for (const item of contrasts) expect(item.ratio, String(item.text)).toBeGreaterThanOrEqual(4.5);
      await page.screenshot({ path: info.outputPath(`uniform-${route.split('?')[0]}-${theme}.png`) });
    }
  }
});
