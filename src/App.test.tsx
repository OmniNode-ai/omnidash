import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { Providers } from './providers/Providers';
import { RegistryProvider } from './registry/RegistryProvider';
import { App } from './App';
import { useFrameStore } from './store/store';
import { createEmptyDashboard } from '@shared/types/dashboard';
import type { RegistryManifest } from './registry/types';

const manifest: RegistryManifest = {
  manifestVersion: '1.0',
  generatedAt: '2026-04-10T00:00:00Z',
  components: {},
};

describe('App', () => {
  beforeEach(() => {
    useFrameStore.setState({ editMode: false, activeDashboard: null, globalFilters: {} });
    const dash = createEmptyDashboard('My Dashboard', 'jonah');
    useFrameStore.getState().setActiveDashboard(dash);
  });

  it('renders the root element', () => {
    render(
      <Providers>
        <RegistryProvider manifest={manifest}>
          <App />
        </RegistryProvider>
      </Providers>
    );
    expect(screen.getByText('My Dashboard')).toBeInTheDocument();
  });
});
