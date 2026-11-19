// @vitest-environment jsdom
/**
 * OMN-19998: Delegation Evidence no page walks the run history, so the page offers the viewer a Load more control
 * (useLoadMoreDelegationDecisions). Failure modes: the first load or a press reading more than one since-page (the
 * walk this ticket removes); a press continuing from anywhere but the cursor the held result stopped at; a store that
 * fits one page still offering the control.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TOPICS } from '@shared/types/topics';
import { DelegationEvidencePage } from '@/pages/DelegationEvidencePage';

// The HTTP source and tenant are mocked as tests/components/useDelegationDecisions.omn19998.test.tsx and
// src/components/dashboard/event-dash/EvEmpty.tenant.test.tsx mock them: a relative projection URL and an unscoped
// tenant, so the recording fake below sees exactly the reads the page issues.
vi.mock('@/data-source/projection-base-url', () => ({
  resolveProjectionBaseUrl: () => '',
  projectionUrl: (topic: string, query?: string) =>
    query ? `/projection/${encodeURIComponent(topic)}?${query}` : `/projection/${encodeURIComponent(topic)}`,
}));
vi.mock('@/data-source/projection-tenant', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data-source/projection-tenant')>()),
  resolveTenantFor: async () => ({ kind: 'unscoped' }),
}));
vi.mock('@/theme/refresh', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/theme/refresh')>()),
  refreshInterval: () => 1_000_000,
}));

const BASE = Date.parse('2026-11-01T00:00:00Z');
const PAGE_SIZE = 500;
const DECISIONS_PATH = `/projection/${TOPICS.delegationDecisions}`;

const runRow = (cursor: number) => ({
  id: `id-${cursor}`,
  projection_cursor: cursor,
  correlation_id: `run-${cursor}`,
  session_id: null,
  task_type: 'coding',
  delegated_to: 'delegate-skill',
  model_name: 'model-a',
  quality_gate_passed: cursor % 4 !== 0,
  quality_gate_detail: null,
  tokens_to_compliance: 120 + (cursor % 50),
  latency_ms: 900 + (cursor % 120),
  created_at: new Date(BASE + cursor * 60_000).toISOString(),
  written_at: new Date(BASE + cursor * 60_000).toISOString(),
});

/**
 * A recording fake of the projection API over a `runs`-run decisions store. The store is oldest first (cursor 1 the
 * oldest): the unfiltered read serves the newest page with next_cursor '0' — the cursor starts an ASCENDING walk from
 * the oldest run — and `since=<c>` serves the next 500 rows after c. Every other topic serves an empty fresh page.
 */
function serveDecisionsStore(runs: number) {
  const decisionsReads: string[] = [];
  const envelope = (rows: ReturnType<typeof runRow>[], extra: Record<string, unknown>) => ({
    ok: true,
    status: 200,
    json: async () => ({ rows, row_count: rows.length, data_freshness: 'fresh', latest_event_at: null, ...extra }),
  });
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input instanceof Request ? input.url : input), 'http://local.test');
    if (url.pathname !== DECISIONS_PATH) return envelope([], {});
    decisionsReads.push(url.search);
    const since = url.searchParams.get('since');
    if (since === null) {
      const newest = Array.from({ length: Math.min(PAGE_SIZE, runs) }, (_, index) => runRow(runs - index));
      return runs > PAGE_SIZE
        ? envelope(newest, { truncated: true, next_cursor: '0' })
        : envelope(newest, { truncated: false, next_cursor: null });
    }
    const after = Number(since);
    const page = Array.from({ length: Math.min(PAGE_SIZE, runs - after) }, (_, index) => runRow(after + 1 + index));
    return runs - after - page.length > 0
      ? envelope(page, { truncated: true, next_cursor: String(after + page.length) })
      : envelope(page, { truncated: false, next_cursor: null });
  }));
  return { decisionsReads };
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <DelegationEvidencePage />
    </QueryClientProvider>,
  );
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('OMN-19998: Delegation Evidence reads the run history one page per press', () => {
  it('the first load sends exactly one decisions request, and each press sends exactly one more from the oldest end', async () => {
    const { decisionsReads } = serveDecisionsStore(120_896);
    renderPage();

    expect(await screen.findByRole('button', { name: 'Load more runs' })).toBeEnabled();
    expect(decisionsReads).toEqual(['']);
    expect(screen.getByText('showing 500')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Load more runs' }));
    expect(await screen.findByText('showing 1K')).toBeInTheDocument();
    expect(decisionsReads).toEqual(['', '?since=0']);

    fireEvent.click(screen.getByRole('button', { name: 'Load more runs' }));
    expect(await screen.findByText('showing 1.5K')).toBeInTheDocument();
    expect(decisionsReads).toEqual(['', '?since=0', '?since=500']);
  });

  it('a 300-run store fits one page, so there is no Load more runs button', async () => {
    const { decisionsReads } = serveDecisionsStore(300);
    renderPage();

    expect(await screen.findByText('showing 300')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more runs' })).not.toBeInTheDocument();
    expect(decisionsReads).toEqual(['']);
  });
});
