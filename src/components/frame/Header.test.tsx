// Updated for OMN-43: Header no longer contains the new-dashboard inline form
// (that flow moved to Sidebar). These tests verify the new Topbar behavior.
//
// OMN-131: the Refresh button now calls `useQueryClient()`, so the test
// wrapper needs a QueryClientProvider in addition to ThemeProvider.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Header } from './Header';
import { ThemeProvider } from '@/theme';

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  );
}

describe('Header — topbar chrome', () => {
  it('renders breadcrumbs with "Dashboards" as current page', () => {
    render(<Header />, { wrapper: Wrapper });
    expect(screen.getByText('Dashboards')).toBeInTheDocument();
    expect(screen.getByText('Home')).toBeInTheDocument();
  });

  it('has a theme toggle button', () => {
    render(<Header />, { wrapper: Wrapper });
    expect(screen.getByRole('button', { name: /toggle theme/i })).toBeInTheDocument();
  });

  it('renders the Refresh icon button', () => {
    render(<Header />, { wrapper: Wrapper });
    expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument();
  });

  it('does NOT render Bell/Help/user-chip/breadcrumb-Menu (removed — no backing systems yet)', () => {
    render(<Header />, { wrapper: Wrapper });
    expect(screen.queryByRole('button', { name: /help/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /notifications/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Jamie Sun')).not.toBeInTheDocument();
  });

  it('does NOT contain a "New dashboard" form (flow moved to Sidebar)', () => {
    render(<Header />, { wrapper: Wrapper });
    expect(screen.queryByLabelText('Dashboard name')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('New dashboard')).not.toBeInTheDocument();
  });
});
