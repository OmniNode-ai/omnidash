// @vitest-environment jsdom
// OMN-19996 AC2: the key tables on the Credentials page show when each key was last used in a run, from the served
// last_used_at on tenant-credentials.v1. Failure modes declared before code:
//   L1  no "Last used" column, or it is not right after Set;
//   L2  a served last_used_at is not shown, or not in the format the Set column uses;
//   L3  a null last_used_at (never used) reads blank or "Not recorded" instead of "Never";
//   L4  a row from an older server, which does not send last_used_at, breaks the table or reads other than "Never";
//   L9  an empty-string last_used_at reads blank instead of "Never";
//   L10 with the optional Expires and Bound host columns shown, the Last used cell shifts the row out of line with its
//       headers (a header without a cell, or a cell without a header).
// L1 to L4 hold for the key history (CredentialsTable, revoked keys) and L5 to L8 for the keys in use (ModelKeys), which
// sit on their providers' rows of the Model providers table, or on their own while GET /models cannot be read.
// Drafted by onex delegate runs 290529d8-af93-4a4b-afd2-cf5808fca405, 6cbed828-4740-4353-8946-a96cd7d4de4e and
// 7c9abf38-639b-488d-a0ac-4dc700be82e4, then corrected by hand.
import { cleanup, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CredentialsTable } from '@/pages/LocalDashboardPage';
import { ModelKeys } from '@/pages/local/model-keys';
import type { ModelProviderRow } from '@/services/models-api';

vi.mock('@/data-source/projection-base-url', () => ({ resolveCommandBaseUrl: () => '' }));

// CredentialsTable draws a table for the key history (revoked keys) only; the keys in use sit on ModelKeys.
const revoked = {
  provider: 'openrouter',
  name: 'llm.openrouter.api_key',
  api_key_ref: 'cred_localinstall_openrouter_0123456789abcdef',
  fingerprint: '0123abcd',
  set_at: '2026-10-07T07:30:00+00:00',
  created_at: '2026-10-07T07:30:02+00:00',
  revoked_at: '2026-10-07T07:40:00+00:00',
};

function lastUsedCell(rows: readonly unknown[]): string {
  render(<CredentialsTable rows={rows} />);
  const table = screen.getByRole('table', { name: 'Revoked key references' });
  const headers = within(table).getAllByRole('columnheader').map((header) => header.textContent);
  const index = headers.indexOf('Last used');
  expect(index).toBeGreaterThan(-1);
  const cells = within(within(table).getAllByRole('row')[1]).getAllByRole('cell');
  return cells[index].textContent ?? '';
}

describe('OMN-19996 Credentials last used', () => {
  it('L1: a "Last used" column sits right after Set', () => {
    render(<CredentialsTable rows={[revoked]} />);
    const table = screen.getByRole('table', { name: 'Revoked key references' });
    expect(within(table).getAllByRole('columnheader').map((header) => header.textContent)).toEqual(
      ['Provider', 'Key ref', 'Fingerprint', 'Set', 'Last used', 'Revoked', 'Expires', 'Bound host'],
    );
  });

  it('L2: a served last_used_at reads in the Set column format', () => {
    expect(lastUsedCell([{ ...revoked, last_used_at: '2026-10-07T07:35:12+00:00' }])).toBe('Oct 7, 07:35:12 UTC');
  });

  it('L3: a null last_used_at reads Never', () => {
    expect(lastUsedCell([{ ...revoked, last_used_at: null }])).toBe('Never');
  });

  it('L4: a row from a server that does not send last_used_at reads Never', () => {
    expect(lastUsedCell([revoked])).toBe('Never');
  });
});

const inUse = { ...revoked, revoked_at: null };
const providers = [{ provider: 'openrouter', set_up: true, models: ['m'], last_test: null }] as unknown as ModelProviderRow[];

async function inUseLastUsed(key: Record<string, unknown>): Promise<string> {
  render(<ModelKeys client={{ list: vi.fn(async () => providers) }} keys={[key]} />);
  // OMN-21970 AC10: the key sits in its provider's card, Last used right after Set.
  const card = await screen.findByRole('article', { name: 'OpenRouter' });
  const terms = within(card).getAllByRole('term').map((term) => term.textContent);
  expect(terms.slice(terms.indexOf('Set'), terms.indexOf('Set') + 2)).toEqual(['Set', 'Last used']);
  return within(card).getByText('Last used').nextElementSibling?.textContent ?? '';
}

describe('OMN-19996 Credentials last used, keys in use', () => {
  it('L5: a served last_used_at reads in the Set column format, right after Set', async () => {
    expect(await inUseLastUsed({ ...inUse, last_used_at: '2026-10-07T07:35:12+00:00' })).toBe('Oct 7, 07:35:12 UTC');
  });

  it('L6: a null last_used_at reads Never', async () => {
    expect(await inUseLastUsed({ ...inUse, last_used_at: null })).toBe('Never');
  });

  it('L7: a row from a server that does not send last_used_at reads Never', async () => {
    expect(await inUseLastUsed(inUse)).toBe('Never');
  });

  it('L8: while GET /models cannot be read, the keys listed on their own still show Last used', async () => {
    const failing = { list: vi.fn(async () => { throw new Error('unreachable'); }) };
    render(<ModelKeys client={failing} keys={[{ ...inUse, last_used_at: '2026-10-07T07:35:12+00:00' }]} />);
    await screen.findByText('The dashboard could not be reached.');
    const table = screen.getByRole('table', { name: 'Provider key references' });
    expect(within(table).getAllByRole('columnheader').map((header) => header.textContent)).toEqual(
      ['Provider', 'Key ref', 'Fingerprint', 'Set', 'Last used'],
    );
    expect(table.querySelector('td[data-label="Last used"]')?.textContent).toBe('Oct 7, 07:35:12 UTC');
  });

  it('L9: an empty-string last_used_at reads Never in both tables', async () => {
    expect(await inUseLastUsed({ ...inUse, last_used_at: '' })).toBe('Never');
    cleanup();
    expect(lastUsedCell([{ ...revoked, last_used_at: '' }])).toBe('Never');
  });

  it('L10: with Expires and Bound host shown, each header keeps one cell and Last used stays after Set', async () => {
    const full = { ...inUse, last_used_at: '2026-10-07T07:35:12+00:00', expires_at: '2026-12-01T00:00:00+00:00', bound_host: 'onex-201' };
    render(<ModelKeys client={{ list: vi.fn(async () => providers) }} keys={[full]} />);
    const card = await screen.findByRole('article', { name: 'OpenRouter' });
    const keyFacts = within(within(card).getByRole('list', { name: 'OpenRouter keys' })).getAllByRole('term').map((term) => term.textContent);
    expect(keyFacts).toEqual(['Fingerprint', 'Set', 'Last used', 'Expires', 'Bound host']);
    expect(within(card).getByText('Last used').nextElementSibling?.textContent).toBe('Oct 7, 07:35:12 UTC');
    expect(within(card).getByText('onex-201')).toBeTruthy();
    cleanup();
    render(<CredentialsTable rows={[{ ...revoked, ...full, revoked_at: revoked.revoked_at }]} />);
    const history = screen.getByRole('table', { name: 'Revoked key references' });
    expect(within(within(history).getAllByRole('row')[1]).getAllByRole('cell')).toHaveLength(
      within(history).getAllByRole('columnheader').length,
    );
  });
});
