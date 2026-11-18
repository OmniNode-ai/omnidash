// @vitest-environment jsdom
// OMN-24616 AC5 (page half): a failed read on Delegation Evidence shows its reason and no figure.
// The audit found a failed read left the panels on "Loading..." for good and said no decisions were recorded.
// Failure modes:
//   R1 a panel whose read failed stays on Loading... (isLoading is false and there is no data)
//   R2 the failed read's reason is not shown
//   R3 a failed decisions read says no delegation decisions were recorded
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const REASON = 'malformed projection response: rows is a string';

vi.mock('echarts-for-react/lib/core', () => ({ default: () => <div /> }));
vi.mock('@/theme', () => ({ useTheme: () => ({ theme: 'light', setTheme: () => {}, availableThemes: ['light', 'dark'] }) }));
vi.mock('@/data-source/data-source-override', () => ({ resolveEffectiveDataSource: () => ({ mode: 'http' }) }));
vi.mock('@/components/dashboard/event-dash/useEventDashData', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  const failed = () => ({ data: undefined, isLoading: false, error: new Error(REASON) });
  return Object.fromEntries(Object.entries(real).map(([name, value]) => [name, name.startsWith('use') ? failed : value]));
});

import { DelegationEvidencePage } from '@/pages/DelegationEvidencePage';

afterEach(() => cleanup());

describe('OMN-24616 AC5: Delegation Evidence after a failed read', () => {
  it('shows the reason on every panel, never Loading or "recorded yet"', async () => {
    const { hook, searchHook } = memoryLocation({ path: '/delegation-evidence' });
    render(
      <QueryClientProvider client={new QueryClient()}><Router hook={hook} searchHook={searchHook}>
        <DelegationEvidencePage />
      </Router></QueryClientProvider>,
    );
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryAllByText(/^Loading/)).toEqual([]);
    expect(screen.getAllByText(REASON).length).toBeGreaterThanOrEqual(5);
    expect(screen.queryByText('No delegation decisions recorded yet.')).toBeNull();
  });
});
