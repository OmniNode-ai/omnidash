// @vitest-environment jsdom
// OMN-21166 part 14, AC77: Overview and Usage show "Updated <time>" beside the refresh button, from the latest served
// read time. Failure modes:
//   U1  the time is the browser clock (now), not when the runtime's rows were read;
//   U2  the line shows on a page it does not belong to, or stays after leaving Overview or Usage;
//   U3  a failed read counts as an update (only a served read does; a failed panel keeps its last good read).
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Header } from '@/components/frame/Header';
import { latestServedRead, publishLocalPageRead, updatedLabel } from '@/services/local-page-refresh';

vi.mock('@/theme', () => ({ useTheme: () => ({ theme: 'light', setTheme: () => {}, availableThemes: ['light', 'dark'] }) }));

const NOW = Date.parse('2026-10-25T12:00:00Z');
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); });
afterEach(() => { cleanup(); act(() => publishLocalPageRead(null, null)); vi.useRealTimers(); });

function header(path: string) {
  const { hook, searchHook } = memoryLocation({ path });
  return render(<QueryClientProvider client={new QueryClient()}><Router hook={hook} searchHook={searchHook}><Header /></Router></QueryClientProvider>);
}

describe('updatedLabel', () => {
  it('U1: writes the served read time in UTC, with the date when it is not today', () => {
    expect(updatedLabel('2026-10-25T10:04:00Z', NOW)).toBe('Updated 10:04 UTC');
    expect(updatedLabel('2026-10-24T23:50:00Z', NOW)).toBe('Updated Oct 24, 23:50 UTC');
  });
});

describe('latestServedRead', () => {
  it('U3: the newest served read; a failed read counts only through its last good read', () => {
    expect(latestServedRead([
      { readAt: '2026-10-25T10:00:00Z' },
      { readAt: '2026-10-25T11:59:00Z', failure: { kind: 'error', message: 'HTTP 503' }, lastGoodAt: '2026-10-25T09:00:00Z' },
      { readAt: '2026-10-25T10:30:00Z' },
    ])).toBe('2026-10-25T10:30:00Z');
    expect(latestServedRead([{ readAt: '2026-10-25T11:59:00Z', failure: { kind: 'error', message: 'HTTP 503' } }])).toBeNull();
  });
});

describe('Header', () => {
  it('U1: Overview shows the published served read time beside Refresh, not the clock', () => {
    act(() => publishLocalPageRead('overview', '2026-10-25T10:04:00Z'));
    header('/overview');
    const line = screen.getByText('Updated 10:04 UTC');
    expect(line.nextElementSibling).toBe(screen.getByRole('button', { name: 'Refresh' }));
    expect(screen.queryByText('Updated 12:00 UTC')).toBeNull();
  });

  it('U2: a read published for Overview is not shown on Runs', () => {
    act(() => publishLocalPageRead('overview', '2026-10-25T10:04:00Z'));
    header('/runs');
    expect(screen.queryByText(/^Updated/)).toBeNull();
  });

  it('U2: nothing published, nothing shown', () => {
    header('/usage');
    expect(screen.queryByText(/^Updated/)).toBeNull();
  });
});
