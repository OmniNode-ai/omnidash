// @vitest-environment jsdom
// OMN-21015: a chart's tooltip writes served text as text. The chart library puts a tooltip formatter's result into
// the page as HTML, so a served value that carries markup (a run id, a model name, a day) would become elements of
// the page. Found in review of b4686d79 from the source; reproduced here before the fix.
//
// Failure modes, each with a test below:
//   H1  markup in a served run id or model name becomes an element in the Runs charts' tooltips;
//   H2  markup in a served day becomes an element in the spend chart's tooltip;
//   H3  the escaping eats text: an ampersand or an angle bracket is dropped or shown doubled;
//   H4  the escaping breaks the tooltip's own line breaks or the library's series marker.
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Option = Record<string, any>;
const harness = vi.hoisted(() => ({ handed: [] as Array<Record<string, any>> }));
vi.mock('echarts-for-react/lib/core', () => ({
  default: ({ option }: { option: Option }) => {
    harness.handed.push(option);
    return <div data-testid="served-chart" />;
  },
}));

import { RunDurationChart, RunTokensChart, SpendByDayChart, type ListedRun } from './charts';

/** What the library does with a formatter's result: it becomes the HTML of the tooltip's element. */
function asTooltip(html: string): HTMLElement {
  const box = document.createElement('div');
  box.innerHTML = html;
  return box;
}
const MARKER = '<span class="marker"></span>';
const run = (extra: Partial<ListedRun> = {}): ListedRun => ({ id: 'run-a', status: 'passed', model: 'model-a', duration: 813, tokensIn: 162, tokensOut: 52, ...extra });

beforeEach(() => { harness.handed.length = 0; });

describe('OMN-21015: served text in a tooltip is text', () => {
  it.each([
    ['Duration per run', (runs: ListedRun[]) => <RunDurationChart runs={runs} onOpen={() => undefined} />],
    ['Tokens per run', (runs: ListedRun[]) => <RunTokensChart runs={runs} onOpen={() => undefined} />],
  ])('H1, H3: %s shows markup in a run id and a model name as the text it is', (_, chart) => {
    render(chart([run({ id: '<b id="planted-id">run</b> & co', model: 'a<i class="planted-model">b</i>>c' })]));
    const html = harness.handed[0]!.tooltip.formatter([{ dataIndex: 0, seriesIndex: 0, marker: MARKER, seriesName: 'Tokens in' }]) as string;
    const box = asTooltip(html);
    expect(box.querySelector('b, i, #planted-id, .planted-model')).toBeNull();
    expect(box.textContent).toContain('<b id="planted-id">run</b> & co');
    expect(box.textContent).toContain('passed · a<i class="planted-model">b</i>>c');
  });

  it('H1: a status that carries markup is text too', () => {
    render(<RunDurationChart runs={[run({ status: '<u>odd</u>' })]} onOpen={() => undefined} />);
    const box = asTooltip(harness.handed[0]!.tooltip.formatter([{ dataIndex: 0, seriesIndex: 0, marker: MARKER }]) as string);
    expect(box.querySelector('u')).toBeNull();
    expect(box.textContent).toContain('<u>odd</u> · model-a');
  });

  it('H2, H3: the spend chart shows markup in a served day as the text it is', () => {
    const columns = [{ key: 'spend_usd', header: 'Actual <em>spend</em>', format: 'currency' }];
    const rows = [{ window_kind: 'day', window_start: '<b class="planted-day">2026-10-12</b> & more', baseline_model: 'model-x', spend_usd: '0.100000' }];
    render(<SpendByDayChart rows={rows} columns={columns} />);
    const html = harness.handed[0]!.tooltip.formatter([{ dataIndex: 0, seriesIndex: 0, marker: MARKER, seriesName: 'Actual <em>spend</em>' }]) as string;
    const box = asTooltip(html);
    expect(box.querySelector('b, em, .planted-day')).toBeNull();
    expect(box.textContent).toContain('<b class="planted-day">2026-10-12</b> & more');
    expect(box.textContent).toContain('Actual <em>spend</em>: $0.10');
  });

  it('H4: the lines stay lines and the library\'s marker stays a marker', () => {
    render(<RunTokensChart runs={[run()]} onOpen={() => undefined} />);
    const html = harness.handed[0]!.tooltip.formatter([
      { dataIndex: 0, seriesIndex: 0, marker: MARKER, seriesName: 'Tokens in' }, { dataIndex: 0, seriesIndex: 1, marker: MARKER, seriesName: 'Tokens out' },
    ]) as string;
    const box = asTooltip(html);
    expect(box.querySelectorAll('br')).toHaveLength(3);
    expect(box.querySelectorAll('span.marker')).toHaveLength(2);
    expect(box.textContent).toBe('run-apassed · model-aTokens in: 162Tokens out: 52');
  });
});
