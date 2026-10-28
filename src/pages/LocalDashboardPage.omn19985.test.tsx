// @vitest-environment jsdom
// OMN-19985: the Credentials page lists each provider key ref with its fingerprint prefix and the time it was set,
// served by tenant-credentials.v1, and never a value.
//
// Failure modes, each with a test below:
//   K1  the served fingerprint prefix or set time is not shown, or not in its own column;
//   K2  a row the producer sent without them (a key set before the change, a hosted registration) shows a blank or a
//       guessed value instead of a typed Not recorded;
//   K3  "Set" shows the projection's own created_at (when the row was first seen) instead of the served set_at;
//   K4  a revoked key reads as live, or its revoke time is dropped.
// OMN-21166 part 18 AC128: the keys in use sit on their providers' rows of the one Model providers table (ModelKeys); the
// key history (revoked keys) stays under CredentialsTable. Each failure mode is held where its key now shows.
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CredentialsTable } from './LocalDashboardPage';
import { ModelKeys } from '@/pages/local/model-keys';
import type { ModelProviderRow } from '@/services/models-api';

vi.mock('@/data-source/projection-base-url', () => ({ resolveCommandBaseUrl: () => '' }));

const live = {
  provider: 'openrouter',
  name: 'llm.openrouter.api_key',
  api_key_ref: 'cred_localinstall_openrouter_0123456789abcdef0123456789abcdef',
  fingerprint: '0123abcd',
  set_at: '2026-10-07T07:30:00+00:00',
  created_at: '2026-10-07T07:30:02+00:00',
  revoked_at: null,
};
const providers = [{ provider: 'openrouter', set_up: true, models: ['m'], last_test: null }] as unknown as ModelProviderRow[];
const client = { list: async () => providers };

async function keyCells(keys: Record<string, unknown>[]): Promise<string[]> {
  render(<ModelKeys client={client} keys={keys} />);
  await screen.findByRole('table', { name: 'Model providers' });
  return within(screen.getByRole('row', { name: /^OpenRouter/ })).getAllByRole('cell').map((cell) => cell.textContent ?? '');
}

describe('OMN-19985 Credentials keys', () => {
  it('K1: shows the served fingerprint prefix and set time in their own columns', async () => {
    const cells = await keyCells([live]);
    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent);
    expect(headers.slice(3, 6)).toEqual(['Key ref', 'Fingerprint', 'Set']);
    expect(cells.slice(2, 5)).toEqual(['llm.openrouter.api_key', '0123abcd', 'Oct 7, 07:30:00 UTC']);
  });

  it('K2: a row without them says Not recorded for each, never a blank', async () => {
    const cells = await keyCells([{ ...live, fingerprint: null, set_at: undefined }]);
    expect(cells.slice(3, 5)).toEqual(['Not recorded', 'Not recorded']);
  });

  it('K3: Set is the served set_at, not the projection created_at', async () => {
    await keyCells([live]);
    expect(screen.queryByText(live.created_at)).toBeNull();
  });

  it('K4: a revoked key shows its revoke time, in the key history', () => {
    render(<CredentialsTable rows={[{ ...live, revoked_at: '2026-10-07T07:40:00+00:00' }]} />);
    const history = screen.getByRole('table', { name: 'Revoked key references' });
    const cells = within(history).getAllByRole('cell').map((cell) => cell.textContent ?? '');
    // OMN-21166 AC60: the time reads for a person; the served value stays whole in the cell's title.
    // OMN-19996: Revoked is the sixth column, after Last used.
    expect(cells[5]).toBe('Oct 7, 07:40:00 UTC');
  });

  it('part 18 AC128: the keys in use are not drawn as a second table', () => {
    render(<CredentialsTable rows={[live]} />);
    expect(screen.queryByRole('table')).toBeNull();
  });
});
