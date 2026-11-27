// @vitest-environment jsdom
// OMN-26646: a run's answer and prompt are shown as markdown with raw HTML switched off, with highlighted copyable code
// and diagrams drawn in omnidash's own colours. This replaces OMN-21166 AC6's "never a markdown renderer" with
// "markdown with raw HTML switched off", keeping its aim: markup inside an answer creates no element.
//
// Failure modes, each with a test below (written before the component; each shown red on dev):
//   F1  markdown shown as its characters (AC1; the browser check is tests/e2e/run-answer-markdown.spec.ts);
//   F2  an injected script, img, iframe or javascript: link creates an element, a handler runs, or a link keeps a
//       dangerous href; an image URL is fetched (AC2);
//   F3  the copy button copies the fence lines, an added trailing newline, or the highlighted markup (AC3, e2e);
//   F4  Raw differs from the stored text by a byte, or the fold breaks or moves into the switch (AC4);
//   F5  the prompt is left raw, or has weaker protection than the answer (AC5);
//   F6  a colour is written in the component, a theme change is not followed, an unreadable token is replaced by a
//       guessed colour, or a diagram that fails to parse crashes the page (AC6);
//   F7  diagram drawing runs below its strict security level, so a label can carry a link, script or HTML (AC7).
import { readFileSync } from 'node:fs';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mermaid = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(async (_id: string, _source: string) => ({ svg: '<svg xmlns="http://www.w3.org/2000/svg" data-drawn="yes"><text>drawn</text></svg>' })),
}));
vi.mock('mermaid', () => ({ default: mermaid }));

import { RunAnswer, RunTraceText } from './workflow-analysis';

const RUN = 'run-26646';
const ANSWERS = 'onex.snapshot.projection.delegation.correlation-trace.v1';

const readOf = (field: 'response_text' | 'prompt_text', text: string) => ({
  topic: ANSWERS, runId: RUN, rows: [{ correlation_id: RUN, [field]: text, data_source: 'real' }], rowCount: 1,
  dataFreshness: 'fresh' as const, latestEventAt: null, readAt: '2026-11-24T14:00:00Z',
});
/** Rendered once the markdown renderer, which loads with the first answer shown, has replaced the stored-text fallback. */
const loaded = async <T extends { container: HTMLElement }>(view: T): Promise<T> => {
  await waitFor(() => expect(view.container.querySelector('.workflow-answer-markdown')).not.toBeNull(), { timeout: 15_000 });
  return view;
};
const answer = (text: string) => loaded(render(<RunAnswer runId={RUN} read={readOf('response_text', text)} />));
const prompt = (text: string) => loaded(render(<RunTraceText runId={RUN} kind="prompt" read={readOf('prompt_text', text)} />));

const TOKENS: Record<string, string> = {
  '--ds-ink': 'rgb(10, 10, 10)', '--ds-ink-3': 'rgb(82, 82, 82)', '--ds-brand': 'rgb(37, 99, 235)', '--ds-chart-grid': 'rgba(10, 10, 10, 0.06)',
  ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`--ds-chart-${i + 1}`, `rgb(${i + 1}, ${i + 2}, ${i + 3})`])),
};
const setTokens = (tokens: Record<string, string>) => { for (const [name, value] of Object.entries(tokens)) document.documentElement.style.setProperty(name, value); };

beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); mermaid.initialize.mockClear(); mermaid.render.mockClear(); setTokens(TOKENS); });
afterEach(() => {
  cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  document.documentElement.removeAttribute('style'); document.documentElement.removeAttribute('data-theme');
});

const PAYLOADS = [
  ['script', '<script>alert(1)</script>', 'script'],
  ['img with a handler', '<img src=x onerror=alert(1)>', 'img'],
  ['iframe', '<iframe src=x>', 'iframe'],
] as const;

describe('no markup from an answer', () => {
  it.each(PAYLOADS)('F2: %s is shown as its text and creates no element', async (_name, payload, tag) => {
    const alert = vi.fn(); vi.stubGlobal('alert', alert);
    const { container } = await answer(`before\n\n${payload}\n\nafter`);
    expect(`${tag}: ${container.querySelectorAll(tag).length}`).toBe(`${tag}: 0`);
    expect(container.textContent).toContain(payload);
    expect(alert).not.toHaveBeenCalled();
  });

  it('F2: the three payloads together create no script, img or iframe, and each stays visible as text', async () => {
    const all = PAYLOADS.map(([, payload]) => payload).join('\n\n');
    const { container } = await answer(all);
    for (const [, payload, tag] of PAYLOADS) {
      expect(`${tag}: ${container.querySelectorAll(tag).length}`).toBe(`${tag}: 0`);
      expect(container.textContent).toContain(payload);
    }
  });

  it.each([
    ['plain', '[x](javascript:alert(1))'],
    ['upper case', '[x](JaVaScRiPt:alert(1))'],
    ['entity-encoded', '[x](java&#115;cript:alert(1))'],
    ['data url', '[x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)'],
    ['vbscript', '[x](vbscript:msgbox(1))'],
    ['relative', '[x](/admin/delete)'],
    ['reference style', '[x][r]\n\n[r]: javascript:alert(1)'],
    ['autolink', '<javascript:alert(1)>'],
  ])('F2: a %s dangerous link renders as text with no href', async (_name, md) => {
    const { container } = await answer(md);
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs.filter((href) => href !== null)).toEqual([]);
  });

  it('F2: a link renders with its href only for http, https and mailto (positive control for the allow-list)', async () => {
    const { container } = await answer('[web](https://example.invalid/a) [plain](http://example.invalid/b) [mail](mailto:a@example.invalid) [bad](javascript:alert(1))');
    const links = Array.from(container.querySelectorAll('a')).map((a) => [a.textContent, a.getAttribute('href')]);
    expect(links).toEqual([['web', 'https://example.invalid/a'], ['plain', 'http://example.invalid/b'], ['mail', 'mailto:a@example.invalid']]);
    expect(container.textContent).toContain('bad');
    for (const a of Array.from(container.querySelectorAll('a')).filter((link) => link.getAttribute('href'))) expect(a.getAttribute('rel')).toContain('noopener');
  });

  it('F2: an image is not rendered, so no image URL is fetched; its alt text shows instead', async () => {
    const { container } = await answer('![a tracking pixel](http://example.invalid/pixel.png)\n\n<img src="http://example.invalid/raw.png">');
    expect(container.querySelectorAll('img').length).toBe(0);
    expect(container.textContent).toContain('a tracking pixel');
    expect(container.innerHTML).not.toContain('pixel.png"');
  });
});

describe('renders markdown', () => {
  it('F1: bold, an ordered list, a heading and a table become elements, with no markdown characters left', async () => {
    const { container } = await answer('# Heading one\n\n**Answering Questions**\n\n1. first\n2. second\n\n| a | b |\n| - | - |\n| 1 | 2 |');
    expect(container.querySelector('strong')?.textContent).toBe('Answering Questions');
    expect(container.querySelectorAll('ol > li').length).toBe(2);
    expect(container.querySelector('.workflow-answer-markdown :is(h1,h2,h3,h4)')?.textContent).toBe('Heading one');
    expect(container.querySelectorAll('table th').length).toBe(2);
    expect(container.textContent).not.toMatch(/\*\*|^# |\| - \|/m);
  });
});

describe('code blocks', () => {
  it('F3: a fenced block shows its language label and a copy button that copies only the code between the fences', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { container } = await answer('text\n\n```python\nprint("hi")\nx = 1\n```\n\nafter');
    expect(within(container).getByText('python')).toBeTruthy();
    fireEvent.click(within(container).getByRole('button', { name: /copy/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith('print("hi")\nx = 1');
  });

  it('F3: highlighting adds token spans and keeps the code text whole', async () => {
    const { container } = await answer('```ts\nconst a: number = 1;\n```');
    const code = container.querySelector('pre code') ?? container.querySelector('pre');
    expect(code?.querySelectorAll('span').length ?? 0).toBeGreaterThan(1);
    expect(code?.textContent?.replace(/\n$/, '')).toBe('const a: number = 1;');
  });
});

describe('raw view', () => {
  const STORED = '**bold** and `code`\n# not a heading here\r\n\ttabbed  line  \n\n<b>x</b>\n';

  it('F4: Raw shows the stored text character for character, markup characters included', async () => {
    const { container } = await answer(STORED);
    fireEvent.click(screen.getByRole('button', { name: 'Raw' }));
    const raw = container.querySelector('pre.workflow-run-answer-text');
    expect(raw?.textContent).toBe(STORED);
    expect(container.querySelector('strong')).toBeNull();
  });

  it('F4: Rendered is the default, and switching back to Rendered shows the formatted answer again', async () => {
    const { container } = await answer('**bold**');
    expect(screen.getByRole('button', { name: 'Rendered' }).getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('strong')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Raw' }));
    expect(container.querySelector('strong')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Rendered' }));
    expect(container.querySelector('strong')?.textContent).toBe('bold');
  });

  const LONG = Array.from({ length: 80 }, (_, line) => `line ${line + 1} of a **long** answer`).join('\n');

  it.each(['Rendered', 'Raw'])('F4: a long answer is folded under "Show the answer" and expands on click in the %s view', async (view) => {
    const { container } = await answer(LONG);
    if (view === 'Raw') fireEvent.click(screen.getByRole('button', { name: 'Raw' }));
    const fold = container.querySelector('details.workflow-run-answer-fold') as HTMLDetailsElement;
    expect(fold).not.toBeNull();
    expect(fold.open).toBe(false);
    expect(fold.querySelector('summary')?.textContent).toMatch(/^Show the answer \(80 lines, [\d,.]+K? characters\)$/);
    fireEvent.click(fold.querySelector('summary')!);
    expect(fold.open).toBe(true);
    expect(fold.textContent).toContain('line 80 of a');
  });

  it('F4: the switch is outside the fold: it is not inside the details element, and switching keeps the fold as it was', async () => {
    const { container } = await answer(LONG);
    const fold = container.querySelector('details.workflow-run-answer-fold') as HTMLDetailsElement;
    const raw = screen.getByRole('button', { name: 'Raw' });
    expect(fold.contains(raw)).toBe(false);
    fireEvent.click(fold.querySelector('summary')!);
    expect(fold.open).toBe(true);
    fireEvent.click(raw);
    expect(container.querySelector('details.workflow-run-answer-fold')).toBe(fold);
    expect(fold.open).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Rendered' }));
    expect(fold.open).toBe(true);
  });

  it('F4: a short answer is not folded in either view', async () => {
    const { container } = await answer('short **answer**');
    expect(container.querySelector('details')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Raw' }));
    expect(container.querySelector('details')).toBeNull();
  });
});

describe('prompt', () => {
  it('F5: the prompt renders markdown, with the same protection and the same Rendered / Raw switch as the answer', async () => {
    const text = '**bold prompt**\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n<iframe src=x>\n\n[x](javascript:alert(1))';
    const { container } = await prompt(text);
    expect(container.querySelector('strong')?.textContent).toBe('bold prompt');
    for (const tag of ['script', 'img', 'iframe']) expect(`${tag}: ${container.querySelectorAll(tag).length}`).toBe(`${tag}: 0`);
    expect(container.textContent).toContain('<script>alert(1)</script>');
    expect(container.querySelector('a')?.getAttribute('href') ?? null).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Raw' }));
    expect(container.querySelector('pre.workflow-run-answer-text')?.textContent).toBe(text);
  });

  it('F5: a long prompt is folded under "Show the prompt" in both views', async () => {
    const long = Array.from({ length: 40 }, (_, line) => `prompt line ${line + 1}`).join('\n');
    const { container } = await prompt(long);
    const fold = container.querySelector('details.workflow-run-answer-fold') as HTMLDetailsElement;
    expect(fold.querySelector('summary')?.textContent).toMatch(/^Show the prompt \(40 lines/);
    fireEvent.click(screen.getByRole('button', { name: 'Raw' }));
    expect(container.querySelector('details.workflow-run-answer-fold')).toBe(fold);
    expect(fold.open).toBe(false);
  });
});

const DIAGRAM = 'Here is a flow:\n\n```mermaid\ngraph TD\n  A[Start] --> B[End]\n```\n';

describe('mermaid strict', () => {
  it('F7: diagram drawing is initialised with the strict security level and plain-text labels', async () => {
    await answer(DIAGRAM);
    await waitFor(() => expect(mermaid.render).toHaveBeenCalled());
    expect(mermaid.initialize).toHaveBeenCalled();
    for (const [config] of mermaid.initialize.mock.calls as unknown as [Record<string, unknown>][]) {
      expect(config.securityLevel).toBe('strict');
      expect(config.htmlLabels).toBe(false);
      expect((config.flowchart as Record<string, unknown> | undefined)?.htmlLabels).toBe(false);
      expect(config.startOnLoad).toBe(false);
    }
  });

  it('F7: the diagram source reaches the renderer as written, and the prompt is drawn under the same strict settings', async () => {
    await prompt(DIAGRAM);
    await waitFor(() => expect(mermaid.render).toHaveBeenCalled());
    expect(mermaid.render.mock.calls[0][1]).toBe('graph TD\n  A[Start] --> B[End]');
    expect((mermaid.initialize.mock.calls[0][0] as Record<string, unknown>).securityLevel).toBe('strict');
  });

  it('F7: an answer without a diagram never loads or initialises the diagram library', async () => {
    await answer('plain **text** and\n\n```js\nconst a = 1;\n```');
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    expect(mermaid.initialize).not.toHaveBeenCalled();
    expect(mermaid.render).not.toHaveBeenCalled();
  });
});

describe('diagram colours', () => {
  const lastTheme = () => (mermaid.initialize.mock.calls.at(-1)?.[0] as { themeVariables: Record<string, string>; theme: string }).themeVariables;

  it('F6: the theme variables are the design tokens read from the page, never written values', async () => {
    await answer(DIAGRAM);
    await waitFor(() => expect(mermaid.render).toHaveBeenCalled());
    const colours = Object.values(lastTheme()).filter((value) => /^(#|rgb|hsl|oklch)/i.test(value));
    expect(colours.length).toBeGreaterThan(0);
    for (const colour of colours) expect(Object.values(TOKENS)).toContain(colour);
    expect(Object.values(lastTheme())).toContain(TOKENS['--ds-chart-1']);
    expect(Object.values(lastTheme())).toContain(TOKENS['--ds-ink']);
  });

  it('F6: switching the theme redraws the diagram with the colours the new theme reads', async () => {
    await answer(DIAGRAM);
    await waitFor(() => expect(mermaid.render).toHaveBeenCalledTimes(1));
    const dark = { ...TOKENS, '--ds-chart-1': 'rgb(200, 201, 202)', '--ds-ink': 'rgb(240, 240, 240)' };
    act(() => { setTokens(dark); document.documentElement.setAttribute('data-theme', 'dark'); });
    await waitFor(() => expect(mermaid.render).toHaveBeenCalledTimes(2));
    expect(Object.values(lastTheme())).toContain('rgb(200, 201, 202)');
    expect(Object.values(lastTheme())).not.toContain(TOKENS['--ds-chart-1']);
  });

  it('F6: a token that cannot be read means no diagram and no guessed colour: the source is shown as code', async () => {
    // The real tokens are loaded by the test setup; take them away and leave every token but --ds-chart-3 inline.
    const sheet = document.head.querySelector('style[data-ds-tokens]')!;
    sheet.remove(); document.documentElement.style.removeProperty('--ds-chart-3');
    const { container } = await answer(DIAGRAM);
    await waitFor(() => expect(container.textContent).toContain('A[Start] --> B[End]'));
    document.head.appendChild(sheet);
    expect(mermaid.render).not.toHaveBeenCalled();
    expect(container.querySelector('svg[data-drawn]')).toBeNull();
  });

  it('F6: a diagram that fails to parse shows its source as code with a one-line note, and the rest of the answer stays', async () => {
    mermaid.render.mockRejectedValueOnce(new Error('Parse error on line 2'));
    const { container } = await answer('before the diagram\n\n```mermaid\ngraph TD\n  A -->\n```\n\nafter the diagram');
    await waitFor(() => expect(container.textContent).toContain('could not draw this diagram'));
    expect(container.textContent).toContain('A -->');
    expect(container.textContent).toContain('before the diagram');
    expect(container.textContent).toContain('after the diagram');
    expect(container.textContent).not.toContain('Parse error on line 2');
  });

  it('F6: no colour value is written in the component source', async () => {
    const files = ['src/pages/local/safe-markdown.tsx', 'src/pages/local/safe-markdown-diagram.tsx'];
    const literal = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(|\boklab\(|\blab\(|\bhwb\(/;
    for (const file of files) {
      const source = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      expect(`${file}: ${source.match(literal)?.[0] ?? 'none'}`).toBe(`${file}: none`);
    }
  });
});
