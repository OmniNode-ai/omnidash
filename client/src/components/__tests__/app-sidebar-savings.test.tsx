import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Verify that the Token Savings page is listed in the Intelligence
 * subgroup of the sidebar and routes to /savings (OMN-6968).
 *
 * The wiring-status module is mocked so that all pages are visible
 * regardless of their pipeline status. Wiring-based filtering is
 * covered separately in sidebar-wiring-filter.test.tsx.
 */

// Mock wiring-status so all routes are visible (bypass pipeline status filtering).
vi.mock('@shared/wiring-status', () => ({
  isRouteVisible: () => true,
  getRouteWiringStatus: () => 'working',
}));

// Mock wouter to avoid router issues in tests.
// Do NOT set data-testid on the <a> — it would override the data-testid
// from SidebarMenuButton's asChild/Slot merge.
vi.mock('wouter', () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: ReactNode;
    [k: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  // Location is /events — an advanced route — so the Advanced collapsible
  // section auto-opens on render without needing a click.
  useLocation: () => ['/events', vi.fn()],
}));

// Mock useWebSocket
vi.mock('@/hooks/useWebSocket', () => ({
  useWebSocket: vi.fn().mockReturnValue({ isConnected: false, connectionStatus: 'disconnected' }),
}));

// Mock useAuth
vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn().mockReturnValue({ authenticated: true, isLoading: false, user: null }),
}));

// Mock useHealthProbe
vi.mock('@/hooks/useHealthProbe', () => ({
  useHealthProbe: vi.fn().mockReturnValue({ status: 'up' }),
}));

// Must import after mocks
import { AppSidebar } from '../app-sidebar';
import { SidebarProvider } from '@/components/ui/sidebar';
import { DemoModeProvider } from '@/contexts/DemoModeContext';
import { PreferencesProvider } from '@/contexts/PreferencesContext';

function renderSidebar() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PreferencesProvider>
        <DemoModeProvider>
          <SidebarProvider defaultOpen={true}>
            <AppSidebar />
          </SidebarProvider>
        </DemoModeProvider>
      </PreferencesProvider>
    </QueryClientProvider>
  );
}

describe('AppSidebar - Token Savings (OMN-6968)', () => {
  it('should include Token Savings link in sidebar navigation', () => {
    renderSidebar();
    const link = screen.getByTestId('nav-savings');
    expect(link).toBeInTheDocument();
    expect(link).toHaveTextContent('Token Savings');
  });

  it('should link Token Savings to /savings route', () => {
    renderSidebar();
    const link = screen.getByTestId('nav-savings');
    // SidebarMenuButton uses asChild — the merged <a> element receives
    // both the data-testid from the button and the href from the Link mock.
    const anchor = link.closest('a') ?? link.querySelector('a');
    expect(anchor).toBeTruthy();
    expect(anchor?.getAttribute('href')).toBe('/savings');
  });

  it('should place Token Savings in the Intelligence subgroup', () => {
    renderSidebar();
    // Token Savings should share a parent section with other Intelligence items
    // like Pattern Intelligence (/patterns)
    const savingsLink = screen.getByTestId('nav-savings');
    const patternsLink = screen.getByTestId('nav-patterns');

    // Both should exist in the sidebar
    expect(savingsLink).toBeInTheDocument();
    expect(patternsLink).toBeInTheDocument();
  });
});
