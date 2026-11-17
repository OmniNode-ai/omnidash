// OMN-24616 AC5: a render error on a local page never blanks the app. The frame stays, and the page names the failure
// with a way back to Overview.
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from './providers/Providers';
import { RegistryProvider } from './registry/RegistryProvider';
import { App } from './App';
import type { RegistryManifest } from './registry/types';

vi.mock('./pages/LocalDashboardPage', () => ({
  LocalDashboardPage: () => { throw new Error('rows[3].created_at is not a string'); },
}));

const manifest: RegistryManifest = { manifestVersion: '1.0', generatedAt: '2026-04-10T00:00:00Z', components: {} };

describe('a local page that throws while rendering', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/runs');
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows the page failure with its reason, inside the frame', async () => {
    render(<Providers><RegistryProvider manifest={manifest}><App /></RegistryProvider></Providers>);
    const alert = await screen.findByRole('alert', {}, { timeout: 30000 });
    expect(alert.textContent).toContain('Runs could not be shown');
    expect(alert.textContent).toContain('rows[3].created_at is not a string');
    expect(screen.getByRole('link', { name: 'Go to Overview' })).toBeTruthy();
  }, 60000);
});
