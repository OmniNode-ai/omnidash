// @vitest-environment jsdom
// OMN-19986 AC2: the API Keys page's Local identity card reads local-identity.v1 and shows when this install's tenant
// identity was minted, beside the tenant it already reads from local-environment.v1 (OMN-21166 part 11).
//
// Failure modes, each with a test below:
//   I1  the card never reads local-identity.v1, so the mint time the projection serves is never shown;
//   I2  with local-identity.v1 not served, the Tenant goes blank (the OMN-21166 part 11 regression) or a minted row is
//       drawn that could only ever read Not recorded (OMN-21166 part 18 AC130);
//   I3  a served identity row for another tenant is shown as this install's mint time;
//   I4  a served minted_at that is not a time is drawn as "Invalid Date" or as raw text;
//   I5  with two served rows for the tenant, an older one listed first wins over the newest updated_at.
import { act, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ENVIRONMENT = 'onex.snapshot.projection.local-environment.v1';
const IDENTITY = 'onex.snapshot.projection.local-identity.v1';

const harness = vi.hoisted(() => ({
  reads: [] as string[],
  reachable: [] as string[],
  answer: (() => Promise.resolve([])) as (topic: string) => Promise<unknown[]>,
}));

vi.mock('@/data-source', () => ({
  createSnapshotSource: () => ({
    async *readAll() { yield []; },
    readSnapshot: async (topic: string) => {
      harness.reads.push(topic);
      const rows = await harness.answer(topic);
      return { rows, rowCount: rows.length, dataFreshness: 'fresh', latestEventAt: null, readAt: new Date().toISOString() };
    },
  }),
}));
vi.mock('@/data-source/data-source-override', () => ({ resolveEffectiveDataSource: () => ({ mode: 'http' }) }));
vi.mock('@/data-source/projection-tenant', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data-source/projection-tenant')>()),
  resolveConfiguredTenant: () => 'tenant-a',
}));
vi.mock('@/data-source/exposure-census', () => ({
  fetchExposureCensus: async () => ({ rows: harness.reachable.map((topic) => ({ topic, reachability: 'reachable' })) }),
}));

import { LocalDashboardPage } from '@/pages/LocalDashboardPage';

const native = {
  tenant_id: 'tenant-a', mode: 'native', service: 'local-runtime', observed_state: 'up',
  updated_at: '2026-10-21T09:00:00+00:00', access_mode: 'loopback-token', token_minted_at: '2026-10-21T09:00:00+00:00',
  rotate_hint: 'Restart `onex dashboard`.',
};
const identity = (tenant: string, minted: unknown, updated = '2026-10-20T08:00:00+00:00') => ({
  tenant_id: tenant, minted_at: minted, event_id: 'e-1', updated_at: updated, projection_cursor: 1,
});

async function settle() {
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}

function identityCard(): HTMLElement {
  return screen.getByRole('heading', { name: 'Local identity' }).closest('article')!;
}

function field(card: HTMLElement, term: string): string {
  return within(card).getByText(term).nextElementSibling?.textContent ?? '';
}

async function renderWith(identityRows: unknown[] | null) {
  harness.reachable = identityRows === null ? [ENVIRONMENT] : [ENVIRONMENT, IDENTITY];
  harness.answer = (topic) => Promise.resolve(topic === ENVIRONMENT ? [native] : topic === IDENTITY ? identityRows ?? [] : []);
  render(<LocalDashboardPage pageName="api-keys" />);
  await settle();
  return identityCard();
}

describe('OMN-19986 AC2 Local identity card reads local-identity.v1', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date('2026-10-21T10:00:00Z'));
    harness.reads = [];
  });
  afterEach(() => { vi.useRealTimers(); });

  it('I1: reads local-identity.v1 and shows the tenant and when its identity was minted', async () => {
    const card = await renderWith([identity('tenant-a', '2026-10-20T08:00:00+00:00')]);
    expect(harness.reads).toContain(IDENTITY);
    expect(field(card, 'Tenant')).toContain('tenant-a');
    expect(field(card, 'Identity minted')).toBe('Oct 20, 08:00:00 UTC');
  });

  it('I2: with local-identity.v1 not served the Tenant still shows and no minted row is drawn', async () => {
    const card = await renderWith(null);
    expect(field(card, 'Tenant')).toContain('tenant-a');
    expect(within(card).queryByText('Identity minted')).not.toBeInTheDocument();
  });

  it("I3: another tenant's served identity row is not shown as this install's mint time", async () => {
    const card = await renderWith([identity('tenant-b', '2026-10-19T07:00:00+00:00')]);
    expect(field(card, 'Identity minted')).toBe('Not recorded');
  });

  it('I4: a served minted_at that is not a time reads Not recorded, never Invalid Date or raw text', async () => {
    const card = await renderWith([identity('tenant-a', 'yesterday')]);
    expect(field(card, 'Identity minted')).toBe('Not recorded');
    expect(card).not.toHaveTextContent('Invalid Date');
  });

  it('I5: the newest served row for the tenant by updated_at wins, whatever order the rows arrive in', async () => {
    const card = await renderWith([
      identity('tenant-a', '2026-10-18T06:00:00+00:00', '2026-10-18T06:00:00+00:00'),
      identity('tenant-a', '2026-10-20T08:00:00+00:00', '2026-10-20T08:00:00+00:00'),
    ]);
    expect(field(card, 'Identity minted')).toBe('Oct 20, 08:00:00 UTC');
  });
});
