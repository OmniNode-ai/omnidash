// SPDX-FileCopyrightText: 2026 OmniNode.ai Inc.
// SPDX-License-Identifier: MIT
// @vitest-environment jsdom
// OMN-23330 follow-up (operator review of Workflow's Run timing, 2026-11-11: "use good colors"). The bars were shades of
// the Workflow timing card's one orange accent, so Queue wait, Execution and Duration read as one thing. The field
// palette's timing colours are one family too (light: #7c5700, #713f12, #5b3c18), so the bars take the chart palette's
// series colours, which are made to be told apart in both themes; the card keeps its accent on its heading icon.
// Failure modes:
//   T1  two timings share a colour, or the bars are shades of one card accent;
//   T2  the table beside the chart does not wear the bars' colours on its rows.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('echarts-for-react/lib/core', () => ({ default: () => <div data-testid="served-chart" /> }));

import { RunTimingChart } from '@/theme/design-system/charts';

afterEach(cleanup);

describe('OMN-23330: each run timing wears its own colour', () => {
  it('T1: the timing chart draws the series palette, never shades of a card accent', () => {
    const source = readFileSync(path.resolve(__dirname, '../../src/theme/design-system/charts/bar-charts.tsx'), 'utf8');
    const chart = source.slice(source.indexOf('export function RunTimingChart'), source.indexOf('/** One listed run'));
    expect(chart).not.toMatch(/accentToken|tint/);
    expect(chart).toMatch(/seriesColours\(/);
  });

  it('T2: the table rows wear the colours the bars wear, three different ones', () => {
    render(<RunTimingChart timings={[
      { key: 'queue_wait_ms', label: 'Queue wait', value: 0 }, { key: 'execution_ms', label: 'Execution', value: 15800 },
      { key: 'latency_ms', label: 'Duration', value: 8800 }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show as table: Run timing' }));
    const rows = within(screen.getByRole('table', { name: 'Run timing as a table' })).getAllByRole('row').slice(1);
    const inks = rows.map(row => row.querySelector<HTMLElement>('th')!.style.getPropertyValue('--row-ink'));
    for (const ink of inks) expect(ink).toMatch(/^#[0-9a-f]{6}$/);
    expect(new Set(inks).size).toBe(3);
  });
});
