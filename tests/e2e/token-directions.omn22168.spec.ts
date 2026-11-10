import { expect, test, type Page } from 'playwright/test';
import { chartRows, prefix, serveCharts, meteringAll } from './omn21166-chart-fixtures';

/**
 * OMN-22168 L14 (Lakshman 2026-11-07: "token in and out should be different color and uniform in whole websites"; the
 * Overview's Tokens processed card drew both counts in plain ink). Every figure of tokens in wears one colour and every
 * figure of tokens out another, the same on every page and in both themes; a figure that is not recorded keeps the
 * unavailable ink. The fixture serves the Overview totals by direction so the card draws both counts.
 */
const rows: Record<string, unknown[]> = {
  ...chartRows,
  [prefix + 'metering-summary.v1']: [meteringAll({
    window: 'all', captured_at: '2026-10-20T15:14:51Z', total_cost_usd: 3.39, total_savings_usd: 1030.76,
    total_baseline_cost_usd: 1034.15, tokens_total: 190842392, tokens_input_total: 150000000, tokens_output_total: 40842392,
    run_count: 54228, measured_run_count: 46241, estimated_run_count: 0, unknown_run_count: 7987,
  })],
  [prefix + 'delegation.token-usage.v1']: [{
    total_tokens: 190842392, total_prompt_tokens: 150000000, total_completion_tokens: 40842392,
    total_estimated_cost_usd: 3.39, by_model: [],
  }],
};

test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });

async function useTheme(page: Page, theme: 'light' | 'dark') {
  const current = await page.locator('html').getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  if (current !== theme) await page.getByRole('button', { name: 'Toggle theme' }).click();
  if (theme === 'dark') await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  else await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
}

const PAGES = ['/', '/runs', '/usage', '/workflow', '/delegation-evidence'];

test('L14: tokens in and tokens out are two colours, the same on every page and in both themes', async ({ page }) => {
  const seen: Record<string, Record<string, string[]>> = {};
  for (const theme of ['light', 'dark'] as const) {
    for (const path of PAGES) {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await serveCharts(page, rows);
      await page.goto(path);
      await useTheme(page, theme);
      // A drawn figure, not the arrow icon that carries the same tone.
      await expect(page.locator(':is(span, td, div)[data-field-tone="tokens-in"]').first()).toBeVisible();
      const read = await page.evaluate(() => {
        const ink = (name: string) => {
          const probe = document.createElement('span');
          probe.style.color = `var(${name})`;
          document.body.append(probe);
          const colour = getComputedStyle(probe).color;
          probe.remove();
          return colour;
        };
        const figures: Record<string, string[]> = {};
        for (const el of document.querySelectorAll<HTMLElement>('[data-field-tone="tokens-in"], [data-field-tone="tokens-out"]')) {
          if (el.closest('svg')) continue;
          // The figure itself: a card's or fact's value element when there is one, else the tagged span or cell.
          const figure = el.querySelector<HTMLElement>(':scope > :is(dd, .v, strong, .ev-token-num, .local-recent-value)')
            ?? (el.matches('span, td') ? el : null);
          if (!figure || !(figure.textContent ?? '').trim()) continue;
          const key = `${el.dataset.fieldTone}${el.dataset.fieldUnavailable === 'true' ? ':unavailable' : ''}`;
          (figures[key] ??= []).push(getComputedStyle(figure).color);
          // The token card's arrow wears its figure's colour.
          const arrow = el.matches('.local-token-direction') ? el.querySelector<SVGElement>(':scope > svg') : null;
          if (arrow) (figures[key] ??= []).push(getComputedStyle(arrow).color);
        }
        return { figures, expected: { in: ink('--ds-field-tokens-in'), out: ink('--ds-field-tokens-out'), none: ink('--ds-field-unavailable') } };
      });
      const where = `${path} in ${theme}`;
      expect(Object.keys(read.figures), `${where}: a tokens-in and a tokens-out figure are drawn`).toEqual(expect.arrayContaining(['tokens-in', 'tokens-out']));
      expect(new Set(read.figures['tokens-in']), `${where}: every tokens-in figure`).toEqual(new Set([read.expected.in]));
      expect(new Set(read.figures['tokens-out']), `${where}: every tokens-out figure`).toEqual(new Set([read.expected.out]));
      for (const key of ['tokens-in:unavailable', 'tokens-out:unavailable']) {
        if (read.figures[key]) expect(new Set(read.figures[key]), `${where}: ${key}`).toEqual(new Set([read.expected.none]));
      }
      expect(read.expected.in, `${where}: the two directions differ`).not.toBe(read.expected.out);
      (seen[theme] ??= {})[path] = [read.expected.in, read.expected.out];
    }
  }
  // Control: one colour pair per theme across all five pages, and the themes differ.
  for (const theme of ['light', 'dark']) expect(new Set(Object.values(seen[theme]!).map(pair => pair.join()))).toHaveProperty('size', 1);
  expect(seen.light!['/']).not.toEqual(seen.dark!['/']);
});
