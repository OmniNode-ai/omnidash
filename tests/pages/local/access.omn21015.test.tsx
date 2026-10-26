// @vitest-environment jsdom
// OMN-21015 AC10 (AK-2): API Keys shows the dashboard's access mode, when its current token was minted and how to
// rotate it, from the native row of local-environment.v1 that `onex dashboard` writes at each start.
//
// Failure modes, each with a test below:
//   A1  a field shows something other than the served value, or a guess where nothing is served;
//   A2  a compose row, or another service's native row, is read as the dashboard's own;
//   A3  with no native row the card shows blanks or invented values instead of saying what it waits on;
//   A4  after a restart (a newer mint time served) the card keeps the old one.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DashboardAccess, dashboardAccessRow } from '@/pages/local/access';

const native = {
  tenant_id: '97b9aa50-f53f-adb8-5404-5c7318dd4cb1',
  mode: 'native',
  service: 'local-runtime',
  access_mode: 'loopback-token',
  token_minted_at: '2026-10-17T10:00:00+00:00',
  rotate_hint: 'Restart `onex dashboard`: every start mints a new token, and the one before it stops working.',
};

function field(term: string): string {
  return screen.getByText(term).nextElementSibling?.textContent ?? '';
}

describe('OMN-21015 AC10 dashboard access', () => {
  it('A1: shows the served access mode, mint time and rotate hint as served', () => {
    render(<DashboardAccess rows={[native]} />);
    expect(field('Access')).toBe('loopback-token');
    expect(field('Token minted')).toBe('Oct 17, 10:00:00 UTC');
    // Part 18 AC131: the served words, with the backticked command drawn as code instead of literal backticks.
    expect(field('Rotate')).toBe(native.rotate_hint.replace(/`/g, ''));
    expect(screen.getByText('onex dashboard').tagName).toBe('CODE');
  });

  it('A1: a field the row does not carry says Not recorded', () => {
    render(<DashboardAccess rows={[{ ...native, token_minted_at: null }]} />);
    expect(field('Token minted')).toBe('Not recorded');
  });

  it('A2: compose rows and other native services are not the dashboard', () => {
    const compose = { ...native, mode: 'compose', service: 'postgres', token_minted_at: '2026-10-17T11:00:00+00:00' };
    const other = { ...native, service: 'something-else', token_minted_at: '2026-10-17T12:00:00+00:00' };
    expect(dashboardAccessRow([compose, other, native])?.token_minted_at).toBe(native.token_minted_at);
    expect(dashboardAccessRow([compose, other])).toBeNull();
  });

  it('A3: with no native row it names what it waits on', () => {
    render(<DashboardAccess rows={[]} />);
    expect(screen.getByRole('status')).toHaveTextContent('Access details not reported yet');
    expect(screen.getByRole('status')).toHaveTextContent('onex dashboard');
    expect(screen.queryByText('loopback-token')).toBeNull();
  });

  it('A4: a restart shows the new mint time', () => {
    const { rerender } = render(<DashboardAccess rows={[native]} />);
    rerender(<DashboardAccess rows={[{ ...native, token_minted_at: '2026-10-17T10:30:00+00:00' }]} />);
    expect(field('Token minted')).toBe('Oct 17, 10:30:00 UTC');
  });
});
