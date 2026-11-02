// @vitest-environment jsdom
// OMN-21970: Delegation Evidence's failure panel names its population truthfully.
// Failure modes: F1 a read that walked every page is still captioned "latest served runs";
//                F2 an incomplete read loses the "latest" qualifier and claims to be every run.
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FailureTriage } from './DelegationEvidencePage';
import type { DelegationDecisionRow } from '@/services/event-dash-api';

vi.mock('@/data-source/projection-base-url', () => ({
  resolveProjectionBaseUrl: () => '',
  projectionUrl: (topic: string) => `/projection/${encodeURIComponent(topic)}`,
}));
vi.mock('@/data-source/projection-tenant', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data-source/projection-tenant')>()),
  resolveTenantFor: async () => ({ kind: 'unscoped' }),
}));

const rows = [
  { correlation_id: 'a', terminal_ok: 1, quality_gate_passed: 1 },
  { correlation_id: 'b', terminal_ok: 0, quality_gate_passed: 0 },
  { correlation_id: 'c', terminal_ok: 1, quality_gate_passed: 0 },
] as unknown as DelegationDecisionRow[];

function draw(complete: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><FailureTriage decisions={rows} available complete={complete} /></QueryClientProvider>);
  // The caption heads the By model and By task tabs, not the default By category tab.
  fireEvent.click(screen.getByRole('tab', { name: 'By model' }));
}

describe('OMN-21970: the Evidence failure caption', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ rows: [], row_count: 0, data_freshness: 'fresh' }), { status: 200 })));
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('F1: a complete read is "2 failed of 3 served runs", never the latest', () => {
    draw(true);
    expect(screen.getByText(/2 failed of 3 served runs/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/latest served runs/);
  });

  it('F2: an incomplete read keeps "latest served runs"', () => {
    draw(false);
    expect(screen.getByText(/2 failed of 3 latest served runs/)).toBeInTheDocument();
  });
});
