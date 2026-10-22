// @vitest-environment jsdom
// OMN-21015 AC10 (AK-2): the API Keys page binds the dashboard access card to local-environment.v1 (OMN-19988), so
// the access mode, the current token's mint time and how to rotate it are the served native row's, on the page.
//
// Failure modes, each with a test below:
//   P1  the page never reads local-environment.v1, so the card cannot show what `onex dashboard` wrote at start;
//   P2  the card shows another service's or a compose row's values as the dashboard's own;
//   P3  after a restart (a newer row served) the page keeps the old mint time;
//   P4  with no native row served, the card shows blanks or invented values instead of saying, in plain words, what it waits on;
//   P5  a native row missing its mint time or hint shows a blank or a guess instead of "Not recorded" (JG-19).
//   Not covered here: a refused read and tenant scoping. The server scopes by tenant (JG-14) and the shared panel code
//   owns the refused-read state; a P6 for either passed against every mutation tried, so it would prove nothing.
import { act, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ENVIRONMENT = 'onex.snapshot.projection.local-environment.v1';
const SAVINGS = 'onex.snapshot.projection.delegation.savings.v1';

const harness = vi.hoisted(() => ({
  reads: [] as string[],
  answer: (_topic: string): Promise<unknown[]> => Promise.resolve([]),
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
  fetchExposureCensus: async () => ({ rows: [ENVIRONMENT, SAVINGS].map((topic) => ({ topic, reachability: 'reachable' })) }),
}));

import { LocalDashboardPage } from './LocalDashboardPage';

const native = (minted: string) => ({
  tenant_id: 'tenant-a', mode: 'native', service: 'local-runtime', observed_state: 'up', updated_at: minted,
  access_mode: 'loopback-token', token_minted_at: minted,
  rotate_hint: 'Restart `onex dashboard`: every start mints a new token, and the one before it stops working.',
});
const otherNative = { tenant_id: 'tenant-a', mode: 'native', service: 'local-model', access_mode: 'open', token_minted_at: '2026-10-01T00:00:00+00:00', rotate_hint: 'not this one' };
const compose = { tenant_id: 'tenant-a', mode: 'compose', service: 'local-runtime', access_mode: 'compose-mode', token_minted_at: '2026-10-02T00:00:00+00:00', rotate_hint: 'not this one either' };

async function settle() {
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}

function accessCard(): HTMLElement {
  return screen.getByRole('heading', { name: 'Dashboard access' }).closest('article')!;
}

function field(card: HTMLElement, term: string): string {
  return within(card).getByText(term).nextElementSibling?.textContent ?? '';
}

describe('OMN-21015 AC10 API Keys page binding', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date('2026-10-21T10:00:00Z'));
    harness.reads = [];
  });
  afterEach(() => { vi.useRealTimers(); });

  it('P1/P2: reads local-environment.v1 and shows the native local-runtime row, not another service or compose', async () => {
    harness.answer = (topic) => Promise.resolve(topic === ENVIRONMENT
      ? [compose, otherNative, native('2026-10-21T09:00:00+00:00')]
      : [{ tenant_id: 'tenant-a', sessions: [] }]);
    render(<LocalDashboardPage pageName="api-keys" />);
    await settle();
    expect(harness.reads).toContain(ENVIRONMENT);
    const card = accessCard();
    expect(field(card, 'Access')).toBe('loopback-token');
    expect(field(card, 'Token minted')).toBe('2026-10-21T09:00:00+00:00');
    expect(field(card, 'Rotate')).toContain('every start mints a new token');
  });

  it('P3: a newer row after a restart moves the mint time on the next read', async () => {
    harness.answer = (topic) => Promise.resolve(topic === ENVIRONMENT ? [native('2026-10-21T09:00:00+00:00')] : []);
    render(<LocalDashboardPage pageName="api-keys" />);
    await settle();
    expect(field(accessCard(), 'Token minted')).toBe('2026-10-21T09:00:00+00:00');
    harness.answer = (topic) => Promise.resolve(topic === ENVIRONMENT ? [native('2026-10-21T09:45:00+00:00')] : []);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    await settle();
    expect(field(accessCard(), 'Token minted')).toBe('2026-10-21T09:45:00+00:00');
  });

  it('P4: with no native row served the card says what it waits on and shows no value', async () => {
    harness.answer = (topic) => Promise.resolve(topic === ENVIRONMENT ? [compose] : []);
    render(<LocalDashboardPage pageName="api-keys" />);
    await settle();
    const card = accessCard();
    // OMN-21166 AC39: the user reads what is missing in plain words, never an exposure name.
    expect(within(card).getByRole('status')).toHaveTextContent('Not available yet: dashboard access details');
    expect(within(card).getByRole('status')).not.toHaveTextContent('local-environment');
    expect(within(card).queryByText('compose-mode')).not.toBeInTheDocument();
  });

  it('P5: a native row without a mint time or a hint says Not recorded, never a blank or a guess', async () => {
    const partial = { ...native('2026-10-21T09:00:00+00:00'), token_minted_at: null, rotate_hint: '' };
    harness.answer = (topic) => Promise.resolve(topic === ENVIRONMENT ? [partial] : []);
    render(<LocalDashboardPage pageName="api-keys" />);
    await settle();
    const card = accessCard();
    expect(field(card, 'Access')).toBe('loopback-token');
    expect(field(card, 'Token minted')).toBe('Not recorded');
    expect(field(card, 'Rotate')).toBe('Not recorded');
  });

  // P6/P7/P8: selection among served rows (never a computed fact) and blank-after-trim values (JG-19).
  async function renderWith(rows: unknown[]) {
    harness.answer = (topic) => Promise.resolve(topic === ENVIRONMENT ? rows : []);
    render(<LocalDashboardPage pageName="api-keys" />);
    await settle();
    return accessCard();
  }

  it('P6a: an older matching row listed first does not win; the newest updated_at does', async () => {
    const older = native('2026-10-21T08:00:00+00:00');
    const newer = { ...native('2026-10-21T09:30:00+00:00'), access_mode: 'loopback-token-v2' };
    const card = await renderWith([older, newer]);
    expect(field(card, 'Access')).toBe('loopback-token-v2');
    expect(field(card, 'Token minted')).toBe('2026-10-21T09:30:00+00:00');
  });

  it('P6b: two matching rows tied on the newest updated_at show the not-available state, not a guess', async () => {
    const a = native('2026-10-21T09:00:00+00:00');
    const b = { ...native('2026-10-21T09:00:00+00:00'), access_mode: 'other-mode' };
    const card = await renderWith([a, b]);
    expect(within(card).getByRole('status')).toHaveTextContent('Not available yet: dashboard access details');
    expect(within(card).queryByText('other-mode')).not.toBeInTheDocument();
  });

  it('P6c: with several matching rows, one missing or unparseable updated_at shows the not-available state', async () => {
    const card = await renderWith([native('2026-10-21T09:00:00+00:00'), { ...native('x'), updated_at: 'not-a-date' }]);
    expect(within(card).getByRole('status')).toHaveTextContent('Not available yet: dashboard access details');
  });

  it('P7: whitespace-only values say Not recorded, never a blank', async () => {
    const card = await renderWith([{ ...native('2026-10-21T09:00:00+00:00'), access_mode: '   ', token_minted_at: ' \t', rotate_hint: '\n ' }]);
    expect(field(card, 'Access')).toBe('Not recorded');
    expect(field(card, 'Token minted')).toBe('Not recorded');
    expect(field(card, 'Rotate')).toBe('Not recorded');
  });

  it('P8: a single matching row without updated_at is used as is', async () => {
    const { updated_at: _omit, ...single } = native('2026-10-21T09:00:00+00:00');
    const card = await renderWith([single]);
    expect(field(card, 'Access')).toBe('loopback-token');
    expect(field(card, 'Token minted')).toBe('2026-10-21T09:00:00+00:00');
  });
});
