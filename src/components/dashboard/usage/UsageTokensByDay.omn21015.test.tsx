// @vitest-environment jsdom
// OMN-21015 AC4, series half (requirement US-1): tokens in and tokens out per UTC day as a stacked series split by
// model, from usage-by-model-day.v1. Each segment is one served row's count; the stacking is done by the layout
// (each segment's flex-grow is the served number), so the browser adds nothing up and writes no total.
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
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NO_TOKEN_ROWS, UsageTokensByDay } from './UsageByModelDayWidget';

function row(day: string, model: string | null, tokensIn: number | null, tokensOut: number | null) {
  return { usage_day: day, model_id: model, input_tokens: tokensIn, output_tokens: tokensOut, call_count: 1 };
}

// Constructed rows in the exposure's served order (usage_day, then model_id).
const ROWS = [
  row('2026-10-11', 'gemini-3.5-flash-lite', 300, 40),
  row('2026-10-11', 'qwen3-coder', 1200, 150),
  row('2026-10-12', 'qwen3-coder', 34475, 75052),
];

function bar(direction: 'in' | 'out', day: string): HTMLElement {
  return screen.getByRole('list', { name: `Tokens ${direction} on ${day}, by model` });
}

function segments(direction: 'in' | 'out', day: string): Array<{ text: string; grow: string }> {
  return within(bar(direction, day)).getAllByRole('listitem').map((item) => ({
    text: item.textContent ?? '',
    grow: (item as HTMLElement).style.flexGrow,
  }));
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
    const served = [ROWS[2]!, ROWS[1]!, ROWS[0]!];
    render(<UsageTokensByDay rows={served} />);
    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual(['2026-10-12', '2026-10-11']);
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

  it('U7: a missing or placeholder model id reads Unknown model', () => {
    render(<UsageTokensByDay rows={[row('2026-10-12', null, 10, 2), row('2026-10-12', 'unknown', 7, 1)]} />);
    expect(segments('in', '2026-10-12').map((segment) => segment.text)).toEqual(['Unknown model: 10', 'Unknown model: 7']);
  });

  it('U6: with no rows it says why', () => {
    render(<UsageTokensByDay rows={[]} />);
    expect(screen.getByRole('status').textContent).toBe(NO_TOKEN_ROWS);
    expect(NO_TOKEN_ROWS).toContain('llm-call-completed');
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
