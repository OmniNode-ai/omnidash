import { expect, test, type Page } from 'playwright/test';
import { chartRows, prefix, serveCharts } from './omn21166-chart-fixtures';

// OMN-26646: the run page shows a run's answer as markdown with raw HTML switched off, highlighted copyable code, and
// diagrams drawn in omnidash's design-token colours. Failure modes, one test each (written before the component):
//   F1 markdown shown as its characters; F3 copy puts the fences, a trailing newline or markup on the clipboard;
//   F6 a diagram drawn in written colours, a theme switch not followed, a bad diagram taking the page down;
//   F7 a diagram label that carries a link, a script or HTML, drawn with real mermaid.
const DECISIONS = prefix + 'delegation.decisions.v1';
const RUN_TRACE = prefix + 'run-trace.v1';
const ANSWERS = prefix + 'delegation.correlation-trace.v1';
const RUN = 'chart-run-a';
const DECISION = [{ correlation_id: RUN, created_at: '2026-10-12T10:00:00Z', written_at: '2026-10-12T10:00:00Z', model_name: 'model-alpha',
  quality_gate_passed: 1, actual_score: 0.91, required_bar: 0.8, queue_wait_ms: 40, execution_ms: 900, latency_ms: 950, task_type: 'summarization' }];

async function serveAnswer(page: Page, text: string, prompt = 'a prompt') {
  await serveCharts(page, { ...chartRows, [DECISIONS]: DECISION, [RUN_TRACE]: [], [ANSWERS]: [] });
  await page.route('**/projection/**', (route) => {
    const topic = decodeURIComponent(new URL(route.request().url()).pathname.split('/').at(-1)!);
    if (topic !== ANSWERS) return route.fallback();
    const rows = [{ correlation_id: RUN, response_text: text, prompt_text: prompt, data_source: 'real' }];
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ rows, row_count: 1, data_freshness: 'fresh' }) });
  });
  await page.goto(`/workflow?correlation_id=${RUN}`);
}
const answerCard = (page: Page) => page.getByRole('region', { name: 'Answer' });

test('renders markdown', async ({ page }) => {
  await serveAnswer(page, '# Plan\n\n**Answering Questions**\n\n1. first step\n2. second step\n\n| model | score |\n| --- | --- |\n| alpha | 0.9 |');
  const card = answerCard(page);
  await expect(card.locator('strong')).toHaveText('Answering Questions');
  await expect(card.locator('ol > li')).toHaveCount(2);
  await expect(card.getByRole('heading', { name: 'Plan' })).toBeVisible();
  await expect(card.locator('table th')).toHaveCount(2);
  const shown = (await card.innerText());
  expect(shown).not.toMatch(/\*\*|^# |\| --- \|/m);
});

test('code block shows its language, highlights, and copies only the code', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await serveAnswer(page, 'Run it:\n\n```python\nprint("hi")\nx = [1, 2]\n```\n\ndone');
  const card = answerCard(page);
  await expect(card.getByText('python', { exact: true })).toBeVisible();
  const colours = await card.locator('pre code span').evaluateAll((spans) => new Set(spans.map((span) => getComputedStyle(span).color)).size);
  expect(colours).toBeGreaterThan(1);
  await card.getByRole('button', { name: /copy/i }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('print("hi")\nx = [1, 2]');
});

const FLOW = 'graph TD\n  A[Start] --> B[Decide]\n  B --> C[End]';

/** The page's own reading of a token, as the rgb a canvas paints it, so oklch and rgb tokens compare alike. */
async function tokenColour(page: Page, token: string) {
  return page.evaluate((name) => {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d')!; ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = value; ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${+(a / 255).toFixed(2)})`;
  }, token);
}
const drawn = async (page: Page, selector: string, property: 'fill' | 'stroke') =>
  page.locator(selector).first().evaluate((el, prop) => getComputedStyle(el)[prop as 'fill'], property);

test('mermaid diagram is drawn in the design-token colours in both themes', async ({ page }) => {
  await serveAnswer(page, `Flow:\n\n\`\`\`mermaid\n${FLOW}\n\`\`\``);
  const card = answerCard(page);
  await expect(card.locator('svg .node').first()).toBeVisible();
  const seen: Record<string, string[]> = {};
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    const chart1 = await tokenColour(page, '--ds-chart-1');
    const ink = await tokenColour(page, '--ds-ink');
    const line = await tokenColour(page, '--ds-ink-3');
    await expect.poll(() => drawn(page, 'svg .node rect, svg .node polygon, svg .node path', 'stroke'), { message: `${theme} node border` }).toBe(chart1);
    expect(await drawn(page, 'svg .nodeLabel, svg .node text, svg .label text', 'fill'), `${theme} text`).toBe(ink);
    expect(await drawn(page, 'svg .flowchart-link, svg path.flowchart-link', 'stroke'), `${theme} edge`).toBe(line);
    seen[theme] = [chart1, ink, line];
  }
  expect(seen.light).not.toEqual(seen.dark);
  await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
  await expect.poll(() => drawn(page, 'svg .node rect, svg .node polygon, svg .node path', 'stroke')).toBe(seen.light[0]);
});

test('mermaid diagram that fails to parse shows its source with a one-line note and leaves the page up', async ({ page }) => {
  await serveAnswer(page, 'before\n\n```mermaid\ngraph TD\n  A --> --> [\n```\n\nafter');
  const card = answerCard(page);
  await expect(card.getByText('could not draw this diagram')).toBeVisible();
  await expect(card.locator('pre code')).toContainText('A --> --> [');
  await expect(card).toContainText('before');
  await expect(card).toContainText('after');
  await expect(card.locator('.workflow-answer-diagram svg')).toHaveCount(0);
});

test('mermaid labels cannot add links, scripts or HTML when drawn with real mermaid', async ({ page }) => {
  const dialogs: string[] = []; page.on('dialog', (d) => { dialogs.push(d.message()); void d.dismiss(); });
  await serveAnswer(page, [
    '```mermaid', 'graph TD',
    '  S[Safe node] --> A',
    '  A["<img src=x onerror=alert(1)>label"] --> B["<a href=\'javascript:alert(1)\'>click</a>"]',
    '  C["<script>alert(1)</script>"] --> A',
    '  click A "javascript:alert(1)"',
    '  click B href "https://example.invalid/" "tip"',
    '```'].join('\n'));
  const card = answerCard(page);
  // Positive control: a diagram really is drawn, so the zero counts below are about a drawn svg and not an absent one.
  await expect(card.locator('.workflow-answer-diagram svg')).toHaveCount(1);
  await expect(card.locator('.workflow-answer-diagram svg .node', { hasText: 'Safe node' }).first()).toBeVisible();
  for (const selector of ['svg a', 'svg script', 'svg foreignObject', 'svg img', 'svg iframe', '[onerror]', '[onclick]']) {
    expect(`${selector}: ${await card.locator(selector).count()} ${(await card.locator(selector).evaluateAll((els) => els.map((el) => el.outerHTML.slice(0, 200)))).join(' | ')}`).toBe(`${selector}: 0 `);
  }
  expect(await card.evaluate((el) => /javascript:/i.test(el.innerHTML.replace(/<pre[\s\S]*?<\/pre>/g, '')))).toBe(false);
  expect(dialogs).toEqual([]);
});
