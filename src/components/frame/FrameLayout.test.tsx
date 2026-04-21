// Updated for OMN-43: FrameLayout is now a 2-column grid (240px sidebar, 1fr main).
// The old tests checked for "omnidash" text in the header (now in Sidebar brand block)
// and a theme button (now in Header). Tests updated to reflect new structure.
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Providers } from '@/providers/Providers';
import { RegistryProvider } from '@/registry/RegistryProvider';
import { FrameLayout } from './FrameLayout';
import type { RegistryManifest } from '@/registry/types';

const minimalManifest: RegistryManifest = {
  manifestVersion: '1.0',
  generatedAt: '2026-04-20T00:00:00Z',
  components: {},
};

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <RegistryProvider manifest={minimalManifest}>
        {children}
      </RegistryProvider>
    </Providers>
  );
}

describe('FrameLayout', () => {
  it('renders the OmniDash brand in the sidebar', () => {
    render(
      <FrameLayout>
        <div>content</div>
      </FrameLayout>,
      { wrapper: Wrapper },
    );
    // Brand renders as "Omni" + <em>Dash</em>; check the "an omninode product" tagline.
    expect(screen.getByText('an omninode product')).toBeInTheDocument();
  });

  it('renders children in the main area', () => {
    render(
      <FrameLayout>
        <div data-testid="dashboard-content">test content</div>
      </FrameLayout>,
      { wrapper: Wrapper },
    );
    expect(screen.getByTestId('dashboard-content')).toBeInTheDocument();
  });

  it('renders the Dashboards section in the sidebar nav', () => {
    render(
      <FrameLayout>
        <div>content</div>
      </FrameLayout>,
      { wrapper: Wrapper },
    );
    expect(screen.getByText('Dashboards')).toBeInTheDocument();
  });

  it('has a New dashboard button in the sidebar', () => {
    render(
      <FrameLayout>
        <div>content</div>
      </FrameLayout>,
      { wrapper: Wrapper },
    );
    expect(screen.getByRole('button', { name: /new dashboard/i })).toBeInTheDocument();
  });
});
