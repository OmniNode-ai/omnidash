// @vitest-environment jsdom
// OMN-21015 AC4, series half (requirement US-1): tokens in and tokens out per UTC day as a stacked series split by
// model, from usage-by-model-day.v1. Each segment is one served row's count; the stacking is done by the layout
// (each segment's flex-grow is the served number), so the browser adds nothing up and writes no total. The drawn
// segments carry no text, padding or border and start from a zero basis, so their widths are the counts' proportions;
// every figure is written in the list beside the bar. jsdom does not lay anything out, so the measured widths are
// asserted in a real browser by tests/e2e/local-dashboard-omn21015.spec.ts.
//
// Failure modes, each with a test below:
//   U1  tokens in and tokens out are drawn as one bar, or one of the two is missing (SV-3: never a combined figure)
//   U2  a day's models are merged into one segment instead of split
//   U3  a model whose tokens were not recorded is drawn as a zero-width segment and silently disappears
//   U4  the panel writes a total the runtime never served
//   U5  days or models are re-sorted in the browser
//   U6  no rows renders an empty chart instead of saying why
//   U7  a placeholder model id is shown as if it were a model
//   U8  a served zero is confused with "not recorded"
//   U9  a segment's width does not track its count: its label, padding or border adds width the count did not
//   U10 every bar fills the panel whatever its count, so 5,133 tokens in and 377 out draw as two equal bars
//       (OMN-21166, Chrome walk 2026-10-18); bars share one scale, the largest drawn bar
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NO_TOKEN_ROWS, UsageTokensByDay } from './UsageByModelDayWidget';

function row(day: string, model: string | null, tokensIn: number | null, tokensOut: number | null) {
  return { usage_day: day, model_id: model, input_tokens: tokensIn, output_tokens: tokensOut, call_count: 1 };
}

// Constructed rows in the exposure's served order: usage_day newest first, then model_id ascending.
const ROWS = [
  row('2026-10-12', 'qwen3-coder', 34475, 75052),
  row('2026-10-11', 'gemini-3.5-flash-lite', 300, 40),
  row('2026-10-11', 'qwen3-coder', 1200, 150),
];

function bar(direction: 'in' | 'out', day: string): HTMLElement {
  return screen.getByRole('list', { name: `Tokens ${direction} on ${day}, by model` });
}

/** The drawn segments of the bar that belongs to a direction's list: the element just before it. */
function fills(direction: 'in' | 'out', day: string): HTMLElement[] {
  const drawn = bar(direction, day).previousElementSibling;
  if (drawn === null || !drawn.classList.contains('usage-tokens-bar')) throw new Error(`no drawn bar for tokens ${direction} on ${day}`);
  return [...drawn.children] as HTMLElement[];
}

/** Each model's written figure with the flex-grow of its drawn segment, in the order rendered. */
function segments(direction: 'in' | 'out', day: string): Array<{ text: string; grow: string }> {
  const drawn = fills(direction, day);
  const written = within(bar(direction, day)).getAllByRole('listitem');
  expect(drawn).toHaveLength(written.length);
  return written.map((item, index) => ({ text: item.textContent ?? '', grow: drawn[index]!.style.flexGrow }));
}

describe('OMN-21015 AC4: tokens in and out per day, stacked by model', () => {
  it('U1, U2: each day has a tokens-in bar and a tokens-out bar, one segment per model', () => {
    render(<UsageTokensByDay rows={ROWS} />);
    expect(segments('in', '2026-10-11')).toEqual([
      { text: 'gemini-3.5-flash-lite: 300', grow: '300' },
      { text: 'qwen3-coder: 1,200', grow: '1200' },
    ]);
    expect(segments('out', '2026-10-11')).toEqual([
      { text: 'gemini-3.5-flash-lite: 40', grow: '40' },
      { text: 'qwen3-coder: 150', grow: '150' },
    ]);
    expect(segments('in', '2026-10-12')).toEqual([{ text: 'qwen3-coder: 34,475', grow: '34475' }]);
    expect(segments('out', '2026-10-12')).toEqual([{ text: 'qwen3-coder: 75,052', grow: '75052' }]);
  });

  it('U4: no total is written, for a day or for the window', () => {
    const { container } = render(<UsageTokensByDay rows={ROWS} />);
    const text = container.textContent ?? '';
    // 1,500 = the day's tokens in; 190 = its tokens out; 35,975 and 75,242 = the window's.
    for (const summed of ['1,500', '1500', '190', '35,975', '35975', '75,242', '75242']) {
      expect(text).not.toContain(summed);
    }
  });

  it('U5: days and models keep the order served', () => {
    render(<UsageTokensByDay rows={ROWS} />);
    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual(['2026-10-12', '2026-10-11']);
  });

  it('U5: rows served in another order are rendered in that order, never re-sorted', () => {
    // Oldest day first and models descending, as a differently ordered exposure would serve them.
    const served = [ROWS[2]!, ROWS[1]!, ROWS[0]!];
    render(<UsageTokensByDay rows={served} />);
    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual(['2026-10-11', '2026-10-12']);
    expect(segments('in', '2026-10-11').map((segment) => segment.text)).toEqual(['qwen3-coder: 1,200', 'gemini-3.5-flash-lite: 300']);
  });

  it('U3: a model whose tokens were not recorded is named, never drawn as nothing', () => {
    render(<UsageTokensByDay rows={[row('2026-10-12', 'qwen3-coder', 500, null), row('2026-10-12', 'gemini-3.5-flash-lite', null, 20)]} />);
    expect(segments('in', '2026-10-12')).toEqual([{ text: 'qwen3-coder: 500', grow: '500' }]);
    expect(segments('out', '2026-10-12')).toEqual([{ text: 'gemini-3.5-flash-lite: 20', grow: '20' }]);
    expect(screen.getByText('Tokens in not recorded: gemini-3.5-flash-lite')).toBeInTheDocument();
    expect(screen.getByText('Tokens out not recorded: qwen3-coder')).toBeInTheDocument();
  });

  it('U8: a served zero is a measurement and is written as 0, not as not recorded', () => {
    render(<UsageTokensByDay rows={[row('2026-10-12', 'qwen3-coder', 0, 12)]} />);
    expect(segments('in', '2026-10-12')).toEqual([{ text: 'qwen3-coder: 0', grow: '0' }]);
    expect(screen.queryByText(/not recorded/)).toBeNull();
  });

  it('U9: a drawn segment gets its width from its count alone: zero basis, no text, and nothing else in the bar', () => {
    render(<UsageTokensByDay rows={ROWS} />);
    for (const direction of ['in', 'out'] as const) {
      for (const fill of fills(direction, '2026-10-11')) {
        expect(fill.style.flexBasis).toBe('0px');
        expect(fill.style.flexShrink).toBe('1');
        expect(fill.style.minWidth).toBe('0px');
        expect(fill.textContent).toBe('');
        expect(fill.children).toHaveLength(0);
      }
      // The bar is decoration for the list next to it, which carries every figure as text.
      expect(bar(direction, '2026-10-11').previousElementSibling?.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('U9: the stylesheet gives a drawn segment no padding, border, margin or width of its own', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/styles/local-dashboard.css', 'utf8');
    const rules = [...css.matchAll(/([^{}]*\.usage-tokens-fill[^{}]*)\{([^}]*)\}/g)];
    expect(rules.length).toBeGreaterThan(0);
    for (const [, selector, body] of rules) {
      for (const property of ['padding', 'border', 'margin', 'width', 'flex', 'box-sizing']) {
        expect(`${selector!.trim()} declares ${property}: ${new RegExp(`(^|[;\\s])(min-|max-)?${property}[a-z-]*\\s*:`).test(body!)}`)
          .toBe(`${selector!.trim()} declares ${property}: false`);
      }
    }
  });

  it('U7: a missing or placeholder model id reads Unknown model', () => {
    render(<UsageTokensByDay rows={[row('2026-10-12', null, 10, 2), row('2026-10-12', 'unknown', 7, 1)]} />);
    expect(segments('in', '2026-10-12').map((segment) => segment.text)).toEqual(['Unknown model: 10', 'Unknown model: 7']);
  });

  it('U6: with no rows it says why', () => {
    render(<UsageTokensByDay rows={[]} />);
    expect(screen.getByRole('status').textContent).toBe(NO_TOKEN_ROWS);
    expect(NO_TOKEN_ROWS).toContain('No daily token data');
    expect(screen.queryByRole('list')).toBeNull();
  });
});

describe('OMN-21015 AC4: the Usage page declares the token series over usage-by-model-day.v1', () => {
  it('binds the component to the exposure the table already reads, with tokens in and out as required fields', async () => {
    const { loadLocalPageConfig } = await import('@/layout/local-page-loader');
    const page = loadLocalPageConfig('usage');
    const component = page.components.find((candidate) => candidate.component_id === 'usage-tokens-by-day');
    expect(component?.title).toBe('Tokens per day');
    const binding = component?.data_bindings?.[0];
    expect(binding?.projection_topic).toBe('onex.snapshot.projection.usage-by-model-day.v1');
    expect(binding?.required_fields).toEqual(expect.arrayContaining(['usage_day', 'model_id', 'input_tokens', 'output_tokens']));
    expect(page.dashboard.widgets.some((widget) => widget.data_source === 'usage-tokens-by-day')).toBe(true);
  });
});

describe('OMN-21166: every token bar is drawn on one scale', () => {
  /** The drawn bar's width as a percentage of the widest bar. */
  function barWidth(direction: 'in' | 'out', day: string): number {
    const drawn = bar(direction, day).previousElementSibling as HTMLElement | null;
    if (drawn === null) throw new Error(`no drawn bar for tokens ${direction} on ${day}`);
    return parseFloat(drawn.style.width);
  }

  it('U10: the largest bar is full width and the others are their counts against it', () => {
    render(<UsageTokensByDay rows={ROWS} />);
    expect(barWidth('out', '2026-10-12')).toBe(100);
    expect(barWidth('in', '2026-10-12')).toBeCloseTo((34475 / 75052) * 100, 6);
    expect(barWidth('in', '2026-10-11')).toBeCloseTo((1500 / 75052) * 100, 6);
    expect(barWidth('out', '2026-10-11')).toBeCloseTo((190 / 75052) * 100, 6);
  });

  it('U10: the populated store\'s day, 5,133 in and 377 out, is not drawn as two equal bars', () => {
    render(<UsageTokensByDay rows={[row('2026-10-16', 'Qwen3.8-27B', 5133, 377)]} />);
    expect(barWidth('in', '2026-10-16')).toBe(100);
    expect(barWidth('out', '2026-10-16')).toBeCloseTo((377 / 5133) * 100, 6);
  });

  it('U10, U3: a count that was not recorded adds nothing to its bar\'s length', () => {
    render(<UsageTokensByDay rows={[row('2026-10-16', 'model-a', 400, 100), row('2026-10-16', 'model-b', null, 100)]} />);
    expect(barWidth('in', '2026-10-16')).toBe(100);
    expect(barWidth('out', '2026-10-16')).toBeCloseTo(50, 6);
  });
});
