// @vitest-environment jsdom
// OMN-23330 AC8 (the operator's 2026-11-09 review): the Activity breakdown and Daily trend readouts show the latest served
// day until the pointer selects another, so no blank row sits above the chart.
// Failure modes:
//   D1  with nothing pointed at, a readout is empty (the blank row the review saw);
//   D2  it shows a day that served nothing (a trailing zero-run day, a day with no token count) instead of the latest
//       served one;
//   D3  pointing at another day does not move it, or leaving the chart does not bring the latest day back;
//   D4  with nothing served at all, it invents a day.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import type { InsightDay } from '@/pages/local/insights';
import { RunsPerDay, TokensPerDay } from '@/pages/local/insight-charts';
import { OverviewTrendPanel } from '@/pages/LocalDashboardPage';

const day = (date: string, over: Partial<InsightDay> = {}): InsightDay => ({ day: date, runs: 0, passed: 0, failed: 0, unrecorded: 0,
  passRate: null, spend: null, spendUnmeasured: 0, tokensIn: null, tokensInUnmeasured: 0, tokensOut: null, tokensOutUnmeasured: 0,
  medianLatency: null, ...over });
const DAYS = [
  day('2026-11-06', { runs: 4, passed: 3, failed: 1, tokensIn: 900, tokensOut: 100 }),
  day('2026-11-07', { runs: 6, passed: 6, failed: 0, tokensIn: 1200, tokensOut: 300 }),
  day('2026-11-08', { runs: 2, passed: 1, failed: 1 }),
  day('2026-11-09'),
];

function inRouter(node: React.ReactNode) {
  const { hook, searchHook } = memoryLocation({ path: '/overview' });
  return render(<Router hook={hook} searchHook={searchHook}>{node}</Router>);
}
const readout = (container: HTMLElement) => container.querySelector('.ins-readout')?.textContent ?? '';

describe('OMN-23330 AC8: readouts start on the latest served day', () => {
  it('D1, D2: Runs per day reads the newest day with runs, not the trailing empty day', () => {
    const { container } = inRouter(<RunsPerDay days={DAYS} />);
    expect(readout(container)).toBe('Nov 8 · 2 runs · 1 passed · 1 failed');
  });

  it('D1, D2: Tokens per day reads the newest day with a token count', () => {
    const { container } = inRouter(<TokensPerDay days={DAYS} />);
    expect(readout(container)).toMatch(/^Nov 7 · 1,200 in, 300 out$/);
  });

  it('D3: pointing at another day moves the readout, and leaving brings the latest day back', () => {
    const { container } = inRouter(<RunsPerDay days={DAYS} />);
    const first = within(screen.getByRole('group', { name: 'Runs per day' })).getAllByRole('button')[0]!;
    fireEvent.mouseEnter(first);
    expect(readout(container)).toBe('Nov 6 · 4 runs · 3 passed · 1 failed');
    fireEvent.mouseLeave(screen.getByRole('group', { name: 'Runs per day' }));
    expect(readout(container)).toBe('Nov 8 · 2 runs · 1 passed · 1 failed');
  });

  it('D4: with nothing served the readout names no day', () => {
    const { container } = inRouter(<RunsPerDay days={[day('2026-11-08'), day('2026-11-09')]} />);
    expect(readout(container)).not.toMatch(/Nov \d/);
  });

  it('D1: the Daily trend reads its newest served day', () => {
    const rows = ['2026-11-06', '2026-11-07', '2026-11-08'].map((date, index) => ({ window_kind: 'day', window_start: date,
      runs_total: [4, 6, 2][index] }));
    const { container } = render(<OverviewTrendPanel rows={rows} window="all" now={Date.parse('2026-11-09T12:00:00Z')}
      columns={[{ key: 'runs_total', header: 'Runs', format: 'number' }]} />);
    expect(readout(container)).toMatch(/^Nov 8 · 2 runs$/);
  });
});
