import { writeFileSync } from 'node:fs';
import { expect, test } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

// OMN-23330 AC11 (the operator's 2026-11-09 review of Delegation Evidence): no empty column below Selected run at
// 1440 px, and model names shown unbroken. Selected run (8 of 12 columns) sat beside Quality gate (4); Quality gate ran
// 291 px taller, so a blank block sat under Selected run. Stretching the row only moved that blank inside the card.
// Failure modes:
//   E1  blank space below Selected run's content, inside its card or beside it, down to the bottom of its row;
//   E2  a served model name breaks across lines anywhere on the page;
//   E3  the check passes vacuously: Selected run is not found, or no long model name is drawn.
// The model names are real ones served on the lab (2026-11-10), long and full of breakable punctuation.
const LONG = ['nvidia/nemotron-3-super-120b-a12b:free', 'poolside/laguna-xs-2.1:free'];
const rows: Record<string, unknown[]> = {
  ...chartRows,
  [prefix + 'delegation.decisions.v1']: (chartRows[prefix + 'delegation.decisions.v1'] as Array<Record<string, unknown>>)
    .map((row, index) => ({ ...row, model_name: LONG[index % LONG.length] })),
  [prefix + 'delegation.model-routing.v1']: [{ total_delegations: 10,
    rows: LONG.map((model_name, index) => ({ model_name, task_type: 'summarization', count: [6, 4][index], pct_of_model: 1,
      pct_of_total: [0.6, 0.4][index] })),
    by_tier: { total_tasks: 10, tier_routed_total: 10, not_tier_routed_count: 0,
      tiers: [{ cost_tier_name: 'local', count: 10, tier_routed: true, pct_of_tier_routed: 1 }] } }],
  // Quality gate's tokens-to-comply list names each model too.
  [prefix + 'delegation.quality-gate.v1']: (chartRows[prefix + 'delegation.quality-gate.v1'] as Array<Record<string, unknown>>)
    .map((row) => ({ ...row, tokens_to_compliance_by_model: LONG.map((model_name, index) => ({ model_name,
      avg_tokens: [1200, 900][index], avg_attempts: 1, sample_count: [6, 4][index] })) })),
};

for (const theme of ['light', 'dark'] as const) {
  test(`AC11 Delegation Evidence at 1440 in ${theme}: no empty column, model names unbroken`, async ({ page }, info) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: theme });
    await serveCharts(page, rows);
    await page.goto('/delegation-evidence');
    const grid = page.locator('.ev-maple-grid');
    await expect(grid.getByText('Selected run', { exact: false }).first()).toBeVisible();
    await expect(page.getByText(LONG[0]!, { exact: true }).first()).toBeVisible();

    const measured = await page.evaluate((names) => {
      // The row Selected run sits in ends at the lowest card sharing its top; its content ends at its last child plus the
      // card's bottom padding. The difference is the empty column.
      const cards = [...document.querySelectorAll('.ev-maple-grid > .maple-cell')].map((cell) => cell.firstElementChild as HTMLElement);
      const selected = cards.find((card) => /selected run/i.test(card.querySelector('h2, h3, .pt')?.textContent ?? ''))!;
      const box = selected.getBoundingClientRect();
      const contentBottom = Math.max(...[...selected.children].map((child) => child.getBoundingClientRect().bottom))
        + parseFloat(getComputedStyle(selected).paddingBottom);
      const rowBottom = Math.max(...cards.filter((card) => Math.abs(card.getBoundingClientRect().top - box.top) < 1)
        .map((card) => card.getBoundingClientRect().bottom));
      const boxes = { top: Math.round(box.top), width: Math.round(box.width), contentBottom: Math.round(contentBottom),
        rowBottom: Math.round(rowBottom), blank: Math.round(rowBottom - contentBottom) };
      // A drawn name is split into pieces (break-opportunity spans), so it is measured on the deepest element holding all
      // of it: the distinct line tops of its whole contents. checkVisibility, not offsetParent, so SVG text counts too.
      const shown: Array<{ name: string; lines: number; cls: string }> = [];
      for (const element of document.body.querySelectorAll('*')) {
        const name = names.find((candidate) => element.textContent?.trim() === candidate);
        if (!name || [...element.children].some((child) => child.textContent?.trim() === name)) continue;
        if (!element.checkVisibility()) continue;
        // Only the name's text is measured, never an icon beside it, so an icon set lower than the text is not a line.
        const rects: DOMRect[] = [];
        const texts = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        for (let node = texts.nextNode(); node; node = texts.nextNode()) {
          const range = document.createRange();
          range.selectNodeContents(node);
          rects.push(...[...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0));
        }
        // Text pieces whose tops sit within half a text height of each other are on one line.
        const half = Math.min(...rects.map((rect) => rect.height)) / 2;
        const tops = rects.map((rect) => rect.top).sort((a, b) => a - b)
          .filter((top, index, all) => index === 0 || top - all[index - 1]! > half);
        shown.push({ name, lines: tops.length, cls: String(element.getAttribute('class') ?? element.tagName) });
      }
      return { boxes, shown };
    }, LONG);

    // The artifact is written before the checks, so a failing run still leaves its picture and numbers.
    await page.screenshot({ path: info.outputPath(`evidence-1440-${theme}.png`), fullPage: true });
    writeFileSync(info.outputPath(`receipt-${theme}.json`), JSON.stringify({ theme, ...measured }, null, 2));
    // E3: Selected run was found and long names were drawn.
    expect(measured.boxes.width).toBeGreaterThan(0);
    expect(measured.shown.length).toBeGreaterThan(0);
    // E1: nothing blank below Selected run's content, down to the bottom of its row.
    expect(measured.boxes.blank).toBeLessThanOrEqual(1);
    // E2: every drawn model name sits on one line.
    expect(measured.shown.filter((entry) => entry.lines !== 1)).toEqual([]);

  });
}
