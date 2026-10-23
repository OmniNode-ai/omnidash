// @vitest-environment jsdom
// OMN-21015 stage 5, U4: the spend chart's legend is a row of real buttons, one per plotted series, that show or hide
// that series. A legend drawn inside the chart cannot be reached from the keyboard, so the legend is page markup and
// the chart is handed only the series that are shown.
//
// Failure modes, each with a test below:
//   J1  a toggle hides nothing: the series is still handed to the chart (the control the spec names);
//   J2  a toggle hides another series than its own;
//   J3  hiding a series changes what is left: another series' values, or its colour (a colour belongs to a series'
//       place in the page's declaration, not to its place among the shown ones);
//   J4  after a series is hidden the tooltip shows another series' served text under a shown series' name;
//   J5  the toggle cannot be worked from the keyboard, or does not say whether its series is shown;
//   J6  a toggle in one baseline's chart hides the series in another baseline's chart;
//   J7  a hidden series cannot be brought back;
//   J8  with every series hidden an empty chart is drawn and nothing says why;
//   J9  a refresh of the served rows brings a hidden series back, or hides one that was shown;
//   J10 the chart's own text (axis labels, tooltip) is drawn in the browser's default serif instead of the page's font.
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

type Option = Record<string, any>;
const handed: Option[] = [];

vi.mock('echarts-for-react/lib/core', () => ({
  default: ({ option }: { option: Option }) => {
    handed.push(option);
    return <div data-testid="served-chart" />;
  },
}));

import { SpendByDayChart } from './charts';

const day = (start: string, extra: Record<string, unknown> = {}) => ({
  window_kind: 'day', window_start: start, as_of: `${start}T23:00:00+00:00`, baseline_model: 'claude-sonnet-5-5',
  baseline_state: 'resolved', spend_usd: '0.100000', counterfactual_usd: '0.400000', savings_usd: '0.300000',
  runs_total: 3, ...extra,
});
const COLUMNS = [
  { key: 'window_start', header: 'Day' },
  { key: 'spend_usd', header: 'Actual spend', format: 'currency' },
  { key: 'counterfactual_usd', header: 'Baseline spend', format: 'currency' },
  { key: 'savings_usd', header: 'Savings', format: 'currency' },
  { key: 'runs_total', header: 'Runs' },
];
const ROWS = [
  day('2026-10-11', { spend_usd: '0.110000', counterfactual_usd: '0.410000', savings_usd: '0.300000' }),
  day('2026-10-12', { spend_usd: '0.120000', counterfactual_usd: '0.520000', savings_usd: '0.400000' }),
];

afterEach(() => {
  cleanup();
  handed.length = 0;
});

/** The figure of one baseline's chart. */
const figure = (baseline = 'claude-sonnet-5-5') => screen.getByRole('figure', { name: `Spend per day vs ${baseline}` });
/** The option the chart inside this figure was last handed. */
function shown(): Option {
  const option = handed.at(-1);
  if (!option) throw new Error('no chart was drawn');
  return option;
}
const names = (option: Option) => (option.series as Option[]).map((series) => series.name);
const toggle = (name: string, baseline?: string) => within(figure(baseline)).getByRole('button', { name });

describe('OMN-21015 U4: the spend chart legend', () => {
  it('J5: each plotted series has a button that says its series is shown, and the chart draws no legend of its own', () => {
    render(<SpendByDayChart rows={ROWS} columns={COLUMNS} />);
    const buttons = within(within(figure()).getByRole('group', { name: 'Series shown' })).getAllByRole('button');
    expect(buttons.map((button) => button.textContent)).toEqual(['Actual spend', 'Baseline spend', 'Savings']);
    expect(buttons.map((button) => button.getAttribute('aria-pressed'))).toEqual(['true', 'true', 'true']);
    expect(buttons.every((button) => button.tagName === 'BUTTON' && button.getAttribute('type') === 'button')).toBe(true);
    expect(shown().legend).toBeUndefined();
  });

  it('J1, J2: pressing a toggle hides its own series and no other', async () => {
    render(<SpendByDayChart rows={ROWS} columns={COLUMNS} />);
    expect(names(shown())).toEqual(['Actual spend', 'Baseline spend', 'Savings']);
    await userEvent.click(toggle('Baseline spend'));
    expect(names(shown())).toEqual(['Actual spend', 'Savings']);
    expect(toggle('Baseline spend').getAttribute('aria-pressed')).toBe('false');
    expect(toggle('Actual spend').getAttribute('aria-pressed')).toBe('true');
    expect(toggle('Savings').getAttribute('aria-pressed')).toBe('true');
  });

  it('J5: the toggles are reached with Tab and worked with Enter and with Space', async () => {
    const user = userEvent.setup();
    render(<SpendByDayChart rows={ROWS} columns={COLUMNS} />);
    await user.tab();
    expect(document.activeElement).toBe(toggle('Actual spend'));
    await user.keyboard('{Enter}');
    expect(names(shown())).toEqual(['Baseline spend', 'Savings']);
    await user.tab();
    expect(document.activeElement).toBe(toggle('Baseline spend'));
    await user.keyboard(' ');
    expect(names(shown())).toEqual(['Savings']);
  });

  it('J3: the series left keep their served values and their colours', async () => {
    render(<SpendByDayChart rows={ROWS} columns={COLUMNS} />);
    const before = (shown().series as Option[]).map((series) => ({ name: series.name, data: series.data, color: series.itemStyle.color }));
    expect(new Set(before.map((series) => series.color)).size).toBe(3);
    await userEvent.click(toggle('Actual spend'));
    const after = (shown().series as Option[]).map((series) => ({ name: series.name, data: series.data, color: series.itemStyle.color }));
    expect(after).toEqual(before.slice(1));
    expect(after[0]!.data).toEqual([0.41, 0.52]);
    expect(after[1]!.data).toEqual([0.3, 0.4]);
  });

  it('J3: a toggle carries the colour of its series', async () => {
    render(<SpendByDayChart rows={ROWS} columns={COLUMNS} />);
    const colours = (shown().series as Option[]).map((series) => series.itemStyle.color);
    const swatches = ['Actual spend', 'Baseline spend', 'Savings'].map((name) => {
      const swatch = toggle(name).querySelector('[data-swatch]') as HTMLElement;
      return swatch.style.backgroundColor;
    });
    const hex = (rgb: string) => `#${(rgb.match(/\d+/g) ?? []).slice(0, 3).map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`;
    expect(swatches.map(hex)).toEqual(colours);
  });

  it('J4: after a series is hidden the tooltip pairs each shown name with its own served text', async () => {
    render(<SpendByDayChart rows={ROWS} columns={COLUMNS} />);
    await userEvent.click(toggle('Actual spend'));
    // The chart library numbers the series it was handed: Baseline spend is now 0 and Savings is 1.
    const text = shown().tooltip.formatter([
      { seriesIndex: 0, dataIndex: 1, marker: '', seriesName: 'Baseline spend' },
      { seriesIndex: 1, dataIndex: 1, marker: '', seriesName: 'Savings' },
    ]);
    expect(text).toBe('2026-10-12<br/>Baseline spend: $0.52<br/>Savings: $0.40');
  });

  it('J7: a second press brings the series back, in its declared place', async () => {
    render(<SpendByDayChart rows={ROWS} columns={COLUMNS} />);
    await userEvent.click(toggle('Baseline spend'));
    await userEvent.click(toggle('Baseline spend'));
    expect(names(shown())).toEqual(['Actual spend', 'Baseline spend', 'Savings']);
    expect(toggle('Baseline spend').getAttribute('aria-pressed')).toBe('true');
  });

  it('J6: a toggle belongs to its own baseline chart', async () => {
    const rows = [...ROWS, day('2026-10-13', { baseline_model: 'gpt-5.5' })];
    const { rerender } = render(<SpendByDayChart rows={rows} columns={COLUMNS} />);
    await userEvent.click(toggle('Savings', 'gpt-5.5'));
    // The page draws again on every refresh; the other chart must still show all three after one.
    rerender(<SpendByDayChart rows={[...rows]} columns={COLUMNS} />);
    expect(toggle('Savings', 'gpt-5.5').getAttribute('aria-pressed')).toBe('false');
    expect(toggle('Savings', 'claude-sonnet-5-5').getAttribute('aria-pressed')).toBe('true');
    const charts = new Map<string, string[]>();
    for (const option of handed) charts.set(String(option.xAxis.data), names(option));
    expect(charts.get('2026-10-11,2026-10-12')).toEqual(['Actual spend', 'Baseline spend', 'Savings']);
    expect(charts.get('2026-10-13')).toEqual(['Actual spend', 'Baseline spend']);
  });

  it('J8: with every series hidden no chart is drawn and the figure says why', async () => {
    render(<SpendByDayChart rows={ROWS} columns={COLUMNS} />);
    for (const name of ['Actual spend', 'Baseline spend', 'Savings']) await userEvent.click(toggle(name));
    expect(within(figure()).queryByTestId('served-chart')).toBeNull();
    expect(within(figure()).getByRole('status').textContent).toBe('Every series is hidden. Turn one on to draw the chart.');
    await userEvent.click(toggle('Savings'));
    expect(within(figure()).getByTestId('served-chart')).toBeTruthy();
    expect(names(shown())).toEqual(['Savings']);
  });

  it('J9: a refresh of the served rows keeps what was hidden hidden, and plots the new rows', async () => {
    const { rerender } = render(<SpendByDayChart rows={ROWS} columns={COLUMNS} />);
    await userEvent.click(toggle('Baseline spend'));
    const refreshed = [...ROWS, day('2026-10-13', { spend_usd: '0.130000', counterfactual_usd: '0.630000', savings_usd: '0.500000' })];
    rerender(<SpendByDayChart rows={refreshed} columns={COLUMNS} />);
    expect(names(shown())).toEqual(['Actual spend', 'Savings']);
    expect(shown().xAxis.data).toEqual(['2026-10-11', '2026-10-12', '2026-10-13']);
    expect((shown().series as Option[])[0]!.data).toEqual([0.11, 0.12, 0.13]);
    expect(toggle('Baseline spend').getAttribute('aria-pressed')).toBe('false');
  });

  it("J10: the chart is handed the page's font for its own text", () => {
    document.body.style.fontFamily = '"IBM Plex Sans", sans-serif';
    try {
      render(<SpendByDayChart rows={ROWS} columns={COLUMNS} />);
      expect(shown().textStyle).toEqual({ fontFamily: '"IBM Plex Sans", sans-serif' });
    } finally {
      document.body.style.fontFamily = '';
    }
  });
});
