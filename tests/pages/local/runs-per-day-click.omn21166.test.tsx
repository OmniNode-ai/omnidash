// @vitest-environment jsdom
// OMN-21166 part 14, AC78: clicking a day in Overview's Runs per day opens Runs filtered to that UTC day. Failure modes:
//   D1  the click filters to the reader's local day, so a run at 23:30 UTC lands on the next day east of UTC;
//   D2  the click only shows the day's readout and opens nothing;
//   D3  the address it opens is one Runs does not read as a day filter.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { InsightsSection } from '@/pages/local/insight-charts';
import { readRunsSearch } from '@/navigation/runs-url-state';

afterEach(cleanup);
const NOW = Date.parse('2026-10-25T09:30:00Z');
const ROWS = [
  { correlation_id: 'late', written_at: '2026-10-24T23:30:00Z', created_at: '2026-10-24T23:30:00Z', quality_gate_passed: true },
  { correlation_id: 'today', written_at: '2026-10-25T08:00:00Z', created_at: '2026-10-25T08:00:00Z', quality_gate_passed: false },
];

describe('Runs per day opens Runs for the day clicked', () => {
  it('D1, D2, D3: a click on Oct 24 opens /runs filtered to 2026-10-24 (UTC)', () => {
    const { hook, searchHook, history } = memoryLocation({ path: '/overview', record: true });
    render(<Router hook={hook} searchHook={searchHook}><InsightsSection decisions={ROWS} now={NOW} view="runs" /></Router>);
    const chart = screen.getByRole('group', { name: 'Runs per day' });
    fireEvent.click(within(chart).getByRole('button', { name: /^Oct 24:/ }));
    const opened = history.at(-1)!;
    expect(opened.split('?')[0]).toBe('/runs');
    expect(readRunsSearch(opened.split('?')[1] ?? '').day).toBe('2026-10-24');
  });

  it('on Runs, the filters already chosen stay and only the day changes', () => {
    const { hook, searchHook, history } = memoryLocation({ path: '/runs?status=failed&model=local-a', record: true });
    render(<Router hook={hook} searchHook={searchHook}><InsightsSection decisions={ROWS} now={NOW} view="runs" /></Router>);
    fireEvent.click(within(screen.getByRole('group', { name: 'Runs per day' })).getByRole('button', { name: /^Oct 25:/ }));
    const view = readRunsSearch(history.at(-1)!.split('?')[1] ?? '');
    expect([view.status, view.model, view.day]).toEqual(['failed', 'local-a', '2026-10-25']);
  });

  it('D2: the bar says what a click does', () => {
    const { hook, searchHook } = memoryLocation({ path: '/overview' });
    render(<Router hook={hook} searchHook={searchHook}><InsightsSection decisions={ROWS} now={NOW} view="runs" /></Router>);
    const chart = screen.getByRole('group', { name: 'Runs per day' });
    expect(within(chart).getByRole('button', { name: /^Oct 25:/ })).toHaveAccessibleDescription('Opens Runs for this day');
  });
});
