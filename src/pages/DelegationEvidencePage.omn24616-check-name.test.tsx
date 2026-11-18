// @vitest-environment jsdom
// OMN-24616 AC6, from the bounded review of #518 at c12b84fe: a quality check served with no check type is a missing
// LABEL, so it reads "Not recorded" (ruling, Lakshman 2026-11-17), not "Not measured".
// Failure mode: N1 the failure triage's Checks by type row for an unnamed check reads "Not measured".
// The named check beside it is the positive control: a list that renders no rows cannot pass.
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FailureTriage } from './DelegationEvidencePage';

vi.mock('@/data-source/projection-base-url', () => ({
  resolveProjectionBaseUrl: () => '',
  projectionUrl: (topic: string) => `/projection/${encodeURIComponent(topic)}`,
}));
vi.mock('@/data-source/projection-tenant', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data-source/projection-tenant')>()),
  resolveTenantFor: async () => ({ kind: 'unscoped' }),
}));

const quality = {
  total_checks: 9, failed_checks: 3, passed_checks: 6,
  by_category: [],
  by_check_type: [
    { check_type: null, failed: 2, total: 5 },
    { check_type: 'syntax_check', failed: 1, total: 4 },
  ],
};

describe('OMN-24616 AC6: an unnamed quality check is a missing label', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ rows: [quality], row_count: 1, data_freshness: 'fresh' }), { status: 200 })));
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('N1: the Checks by type row with no check type reads Not recorded', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><FailureTriage decisions={[]} available complete /></QueryClientProvider>);
    const list = await screen.findByRole('list', { name: 'Failures by check type' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows, 'positive control: both served check types render').toHaveLength(2);
    expect(rows[1].textContent).toMatch(/^syntax check/);
    expect(rows[0].textContent).toMatch(/^Not recorded/);
    expect(rows[0].textContent).not.toMatch(/^Not measured/);
  });
});
