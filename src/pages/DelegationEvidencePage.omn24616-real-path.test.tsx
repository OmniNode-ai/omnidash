// @vitest-environment jsdom
// OMN-24616 AC5 (page half), on the real read path: the runtime's own failure shapes reach Delegation Evidence through
// readProjection, and every panel names the reason and never says nothing was recorded. Only the network edge is
// stubbed (the projection URL and authedFetch); the services, hooks and page are real.
// Failure modes (review of #517, findings 1-5 and 9):
//   E1 an HTTP error on every read shows an empty state ("Awaiting a delegation decision", "recorded yet")
//   E2 a malformed body, a malformed row or a degraded answer with no reason is read as an empty success
//   E3 a failed trace read after a served decision says nothing was recorded for the run
//   E4 a failed headline read shows "Not measured" with no reason
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Serve = (topic: string) => { status: number; body: unknown };
const network: { serve: Serve } = { serve: () => ({ status: 200, body: { rows: [] } }) };

vi.mock('echarts-for-react/lib/core', () => ({ default: () => <div /> }));
vi.mock('@/theme', () => ({ useTheme: () => ({ theme: 'light', setTheme: () => {}, availableThemes: ['light', 'dark'] }) }));
vi.mock('@/data-source/data-source-override', () => ({ resolveEffectiveDataSource: () => ({ mode: 'http' }) }));
vi.mock('@/data-source/projection-tenant', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  resolveTenantFor: async () => ({ kind: 'unscoped' }),
}));
vi.mock('@/data-source/projection-base-url', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  projectionUrl: (topic: string, query?: string) => `/projection/${topic}${query ? `?${query}` : ''}`,
}));
vi.mock('@/data-source/authed-fetch', () => ({
  authedFetch: async (url: string) => {
    const topic = decodeURIComponent(url.split('/projection/')[1]?.split('?')[0] ?? '');
    const { status, body } = network.serve(topic);
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  },
}));

import { DelegationEvidencePage } from '@/pages/DelegationEvidencePage';

afterEach(() => cleanup());

const EMPTY_NOTES = [
  'Awaiting a delegation decision on the bus.',
  'No delegation decisions recorded yet.',
  'Nothing was recorded for this run yet.',
  'No routing data yet.',
];

async function renderPage() {
  const { hook, searchHook } = memoryLocation({ path: '/delegation-evidence' });
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Router hook={hook} searchHook={searchHook}><DelegationEvidencePage /></Router>
    </QueryClientProvider>,
  );
  for (let tick = 0; tick < 20; tick += 1) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
}

function expectNoEmptyNotes() {
  for (const note of EMPTY_NOTES) expect(screen.queryByText(note), note).toBeNull();
  expect(screen.queryAllByText(/^Loading/)).toEqual([]);
}

describe('OMN-24616 AC5: Delegation Evidence on the real read path', () => {
  it('E1, E4: an HTTP error on every read names the error on every panel and on the headline figures', async () => {
    network.serve = () => ({ status: 500, body: { error: 'boom' } });
    await renderPage();
    expectNoEmptyNotes();
    expect(screen.getAllByText('Could not read delegation decisions').length).toBe(2);
    expect(screen.getByText('Could not read model routing')).toBeTruthy();
    expect(screen.getAllByText('Could not read the quality gate').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Could not read token usage')).toBeTruthy();
    // HTTP 500 reads, in the page's plain words, as "The runtime could not answer" (plainUnservedReason).
    expect(screen.getAllByText('Could not read: The runtime could not answer').length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText('Could not read the metering summary: The runtime could not answer').length).toBe(2);
  });

  it('E2: malformed bodies and rows, and a degraded answer with no reason, are failed reads with their reason', async () => {
    network.serve = (topic) => {
      if (topic.includes('decisions')) return { status: 200, body: { rows: 'oops' } };
      if (topic.includes('model-routing')) return { status: 200, body: { rows: [{}] } };
      if (topic.includes('token-usage')) return { status: 200, body: { rows: [{}] } };
      if (topic.includes('quality-gate')) return { status: 200, body: { status: 'degraded' } };
      if (topic.includes('summary')) return { status: 200, body: { rows: [null] } };
      return { status: 200, body: { hello: 'world' } };
    };
    await renderPage();
    expectNoEmptyNotes();
    expect(screen.getAllByText('malformed projection response: rows is a string').length).toBe(2);
    expect(screen.getByText('malformed projection response: row 1 rows is missing')).toBeTruthy();
    expect(screen.getByText('malformed projection response: row 1 by_model is missing')).toBeTruthy();
    expect(screen.getAllByText('the runtime reported this read as degraded').length).toBeGreaterThanOrEqual(1);
  });

  it('E3: a failed trace read after a served decision is a failed read, not "nothing was recorded"', async () => {
    network.serve = (topic) => {
      if (topic.includes('decisions')) {
        return { status: 200, body: { rows: [{ correlation_id: 'run-1', written_at: '2026-11-16T10:00:00Z', created_at: '2026-11-16T10:00:00Z', model_name: 'm', quality_gate_passed: true }] } };
      }
      if (topic.includes('correlation-trace') || topic.includes('trace')) return { status: 500, body: {} };
      return { status: 200, body: { rows: [] } };
    };
    await renderPage();
    expect(screen.getByText('Could not read the correlation trace')).toBeTruthy();
    expect(screen.queryByText('Nothing was recorded for this run yet.')).toBeNull();
  });
});
