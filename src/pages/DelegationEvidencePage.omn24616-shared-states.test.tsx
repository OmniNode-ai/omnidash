// @vitest-environment jsdom
// OMN-24616 AC6: Delegation Evidence uses the same components and the same loading and error wording as the other pages.
// The audit found Delegation Evidence built on a second component family with its own loading and error wording.
// Failure modes:
//   E1  a panel loading reads its own words ("Loading…", "Loading correlation trace…") instead of "Loading data…"
//   E2  a failed read reads "Could not read …" instead of the other pages' "<data> is unavailable."
//   E3  its empty state is not the shared component (class local-dashboard-empty, announced as a status)
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const state: { loading: boolean } = { loading: true };
vi.mock('echarts-for-react/lib/core', () => ({ default: () => <div /> }));
vi.mock('@/theme', () => ({ useTheme: () => ({ theme: 'light', setTheme: () => {}, availableThemes: ['light', 'dark'] }) }));
vi.mock('@/data-source/data-source-override', () => ({ resolveEffectiveDataSource: () => ({ mode: 'http' }) }));
vi.mock('@/components/dashboard/event-dash/useEventDashData', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  const read = () => state.loading
    ? { data: undefined, isLoading: true, error: null }
    : { data: undefined, isLoading: false, error: new Error('HTTP 503') };
  return Object.fromEntries(Object.entries(real).map(([name, value]) => [name, name.startsWith('use') ? read : value]));
});

import { DelegationEvidencePage } from '@/pages/DelegationEvidencePage';

function page() {
  const { hook, searchHook } = memoryLocation({ path: '/delegation-evidence' });
  render(<QueryClientProvider client={new QueryClient()}><Router hook={hook} searchHook={searchHook}><DelegationEvidencePage /></Router></QueryClientProvider>);
}

afterEach(() => cleanup());

describe('OMN-24616 AC6: Delegation Evidence in the shared words and component', () => {
  it('E1, E3: loading panels read "Loading data…" in the shared empty state', () => {
    state.loading = true;
    page();
    const loading = screen.getAllByText(/^Loading/);
    expect(loading.length).toBeGreaterThan(0);
    expect(loading.every(node => node.textContent === 'Loading data…')).toBe(true);
    expect(loading[0]!.closest('.local-dashboard-empty')).toHaveAttribute('role', 'status');
  });

  it('E2: a failed read reads "<data> is unavailable." as on the other pages', () => {
    state.loading = false;
    page();
    expect(screen.queryAllByText(/^Could not read/)).toEqual([]);
    for (const title of ['Routing data is unavailable.', 'Quality data is unavailable.', 'Cost data is unavailable.', 'Usage data is unavailable.', 'Run data is unavailable.']) {
      expect(screen.getAllByText(title).length).toBeGreaterThan(0);
    }
  });
});
