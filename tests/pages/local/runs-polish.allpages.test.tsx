// @vitest-environment jsdom
// OMN-23330 AC9 (the operator's 2026-11-09 review of Runs): every KPI label on one line at 1440 px, durations without
// fractional milliseconds, a duration caption in the axis's unit, and "<0.1%" for a nonzero share under 0.05%.
// Measured live 2026-11-10 at 1440 px: "Median duration" wrapped to two lines (it fits on one with nowrap, 0 px over);
// the duration tooltips printed the served text raw ("Duration: 4925.123 ms"); the caption said "in milliseconds as
// served" over an axis that reads ms, s or min; a model with 1 of 2,893 calls read 0.0%.
// AC9 supersedes OMN-21166 AC55's "the tooltip writes the served text exactly" for the fraction: the exact figure is now
// the whole millisecond.
// Failure modes:
//   R1  a headline card label can wrap at a wide window;
//   R2  a duration tooltip or exact title shows a fraction of a millisecond;
//   R3  the duration caption names a unit the axis does not use;
//   R4  a share under 0.05% reads 0.0% on the Runs model breakdown.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/** The part of an ECharts option this test reads: the tooltip's formatter. */
type ChartOption = { tooltip: { formatter: (params: Array<{ dataIndex: number; marker: string }>) => string } };
const captured: ChartOption[] = [];
vi.mock('echarts-for-react/lib/core', () => ({ default: (props: { option: ChartOption }) => { captured.push(props.option); return <div />; } }));

import { RunDurationChart, RunTimingChart } from '@/theme/design-system/charts';
import { exactMs, formatShare } from '@/lib/format';

const ROOT = path.resolve(__dirname, '../../..');
const strip = (html: string) => html.replace(/<[^>]+>/g, ' ');

describe('OMN-23330 AC9: Runs reads cleanly', () => {
  it('R1: at a wide window a headline card label keeps to one line', () => {
    const css = readFileSync(path.join(ROOT, 'src/styles/seven-page-design.css'), 'utf8');
    const found: string[] = [];
    postcss.parse(css).walkAtRules('media', (media) => {
      // The rule may start at any width up to 1440 px, the width AC9 names.
      const from = /min-width:\s*(\d+)px/.exec(media.params);
      if (!from || Number(from[1]) > 1440) return;
      media.walkDecls('white-space', (decl) => {
        const selector = (decl.parent as postcss.Rule).selector;
        if (/\.local-overview-summary/.test(selector) && /h2/.test(selector) && decl.value === 'nowrap') found.push(selector);
      });
    });
    expect(found.length).toBeGreaterThan(0);
  });

  it('R2: duration tooltips and exact titles read whole milliseconds', () => {
    captured.length = 0;
    const run = { id: 'run-a', status: 'passed', model: 'model-a', duration: '4925.123', tokensIn: null, tokensOut: null };
    render(<RunDurationChart runs={[run] as never} onOpen={() => {}} />);
    const duration = captured.at(-1)!;
    const text = strip(duration.tooltip.formatter([{ dataIndex: 0, marker: '' }]));
    expect(text).toContain('4,925 ms');
    expect(text).not.toMatch(/\d\.\d+ ms/);
    captured.length = 0;
    render(<RunTimingChart timings={[{ key: 'execution', label: 'Execution', value: '132.5' }]} />);
    const timing = captured.at(-1)!;
    expect(strip(String(timing.tooltip.formatter([{ dataIndex: 0, marker: '' }])))).not.toMatch(/\d\.\d+ ms/);
    expect(exactMs('132.5')).toBe('133 ms');
  });

  it('R3: the duration caption does not claim one unit over an axis that reads ms, s or min', () => {
    const run = { id: 'run-a', status: 'passed', model: 'model-a', duration: 70000, tokensIn: null, tokensOut: null };
    const { container } = render(<RunDurationChart runs={[run] as never} onOpen={() => {}} />);
    const caption = container.querySelector('figcaption')?.textContent ?? '';
    expect(caption).not.toMatch(/in milliseconds/);
    expect(caption).toMatch(/axis/);
  });

  it('R4: a nonzero share under 0.05% reads <0.1%', () => {
    expect(formatShare(1 / 2893)).toBe('<0.1%');
    expect(formatShare(2 / 2893)).toBe('0.1%');
  });
});
