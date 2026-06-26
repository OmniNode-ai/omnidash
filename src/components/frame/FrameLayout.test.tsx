// OMN-13602: the multi-dashboard list (the "Dashboards" section + "New dashboard"
// button) was removed with the widget builder. FrameLayout still composes the
// Sidebar + main content; the sidebar now shows a single fixed "Dashboard" entry.
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Providers } from '@/providers/Providers';
import { FrameLayout } from './FrameLayout';

function Wrapper({ children }: { children: ReactNode }) {
  return <Providers>{children}</Providers>;
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

  it('renders the single Dashboard nav entry (OMN-13602)', () => {
    render(
      <FrameLayout>
        <div>content</div>
      </FrameLayout>,
      { wrapper: Wrapper },
    );
    expect(screen.getByTestId('nav-dashboard')).toBeInTheDocument();
  });
});
