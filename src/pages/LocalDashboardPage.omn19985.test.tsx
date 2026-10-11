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
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CredentialsTable } from './LocalDashboardPage';

const live = {
  provider: 'openrouter',
  name: 'llm.openrouter.api_key',
  api_key_ref: 'cred_localinstall_openrouter_0123456789abcdef0123456789abcdef',
  fingerprint: '0123abcd',
  set_at: '2026-10-07T07:30:00+00:00',
  created_at: '2026-10-07T07:30:02+00:00',
  revoked_at: null,
};

function cells(rowName: RegExp): string[] {
  return within(screen.getByRole('row', { name: rowName }))
    .getAllByRole('cell')
    .map((cell) => cell.textContent ?? '');
}

describe('OMN-19985 Credentials table', () => {
  it('K1: shows the served fingerprint prefix and set time in their own columns', () => {
    render(<CredentialsTable rows={[live]} />);
    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent);
    expect(headers).toEqual(['Provider', 'Key ref', 'Fingerprint', 'Set', 'Revoked']);
    expect(cells(/llm\.openrouter\.api_key/)).toEqual([
      'openrouter', 'llm.openrouter.api_key', '0123abcd', '2026-10-07T07:30:00+00:00', 'Not revoked',
    ]);
  });

  it('K2: a row without them says Not recorded for each, never a blank', () => {
    render(<CredentialsTable rows={[{ ...live, fingerprint: null, set_at: undefined }]} />);
    const [, , fingerprint, set] = cells(/llm\.openrouter\.api_key/);
    expect(fingerprint).toBe('Not recorded');
    expect(set).toBe('Not recorded');
  });

  it('K3: Set is the served set_at, not the projection created_at', () => {
    render(<CredentialsTable rows={[live]} />);
    expect(screen.queryByText(live.created_at)).toBeNull();
  });

  it('K4: a revoked key shows its revoke time', () => {
    render(<CredentialsTable rows={[{ ...live, revoked_at: '2026-10-07T07:40:00+00:00' }]} />);
    const [, , , , revoked] = cells(/llm\.openrouter\.api_key/);
    expect(revoked).toBe('2026-10-07T07:40:00+00:00');
  });
});
