// @vitest-environment jsdom
// OMN-19994 AC2: the event-dash pages (Delegation Evidence, Event Bus, Experiments) read tenant-scoped exposures
// through readProjection, which turns a missing tenant into a degraded result instead of a request. Their empty
// panel must show the typed tenant-not-configured state for that result, and keep any other reason as text.
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetExposureMetadataCache } from '@/data-source/projection-tenant';
import { fetchDelegationDecisions } from '@/services/event-dash-api';
import { EvEmpty } from './primitives';

const BASE = 'http://projection.test';
const DECISIONS = 'onex.snapshot.projection.delegation.decisions.v1';

vi.mock('@/data-source/data-source-override', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data-source/data-source-override')>()),
  resolveEffectiveDataSource: () => ({ mode: 'http', baseUrl: BASE }),
}));
vi.mock('@/config/generated/data-source-defaults', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/generated/data-source-defaults')>()),
  PROJECTION_TENANT_ID_DEFAULT: '',
}));

const projectionReads: string[] = [];

beforeEach(() => {
  resetExposureMetadataCache();
  projectionReads.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.endsWith('/projections')) {
      return new Response(JSON.stringify({
        topics: [{ topic: DECISIONS, backing: 'bus', tenant_column: 'tenant_id', tenant_scoped: true }],
      }), { status: 200 });
    }
    projectionReads.push(url);
    return new Response(JSON.stringify({ detail: 'tenant_context_unresolved' }), { status: 422 });
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetExposureMetadataCache();
});

describe('EvEmpty tenant state (OMN-19994 AC2)', () => {
  it('a tenant-scoped read with no tenant configured renders the typed tenant state, not a degraded reason', async () => {
    const result = await fetchDelegationDecisions();
    const { container } = render(<EvEmpty title="No delegation decisions" reason={result.degradedReason} />);

    expect(container.querySelector('[data-tenant-state="not-configured"]')).toBeInTheDocument();
    expect(screen.getByText('Tenant not configured')).toBeInTheDocument();
    expect(screen.queryByText(/HTTP \d{3}/)).not.toBeInTheDocument();
    expect(projectionReads).toEqual([]);
  });

  it('keeps any other degraded reason as text', () => {
    const { container } = render(<EvEmpty title="No delegation decisions" reason="HTTP 500" />);

    expect(screen.getByText('HTTP 500')).toBeInTheDocument();
    expect(container.querySelector('[data-tenant-state="not-configured"]')).not.toBeInTheDocument();
  });
});
